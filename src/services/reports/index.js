import ExcelJS from "exceljs";
import Order from "../../models/Order.js";
import { StatusError } from "../../config/index.js";
import { dashboardHelper } from "../../helpers/index.js";
import { STORE_TIMEZONE, addDaysYmd, addMonthsYm, istYmd } from "../../config/storeTime.js";

// Admin sales reports. Each report declares its columns once — the admin
// table and the Excel export both render from them — and uses the same
// date-range, revenue and segment (channel/payment) rules as the dashboard
// (helpers/dashboard), so a report total always matches the dashboard for
// the same filters. Days, weeks and months are IST (config/storeTime.js).

const { EXCLUDED_REVENUE_STATUSES } = dashboardHelper;
const EXPORT_ROW_LIMIT = 50000;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isRevenue = { $not: [{ $in: ["$order_status", EXCLUDED_REVENUE_STATUSES] }] };
const sumIf = (cond, value) => ({ $sum: { $cond: [cond, value, 0] } });
// Migrated/legacy line items predate final_line_total (default 0).
const lineNet = { $cond: [{ $gt: ["$item.final_line_total", 0] }, "$item.final_line_total", "$item.total_price"] };
const lineDiscount = { $add: [
  { $ifNull: ["$item.sale_discount", 0] },
  { $ifNull: ["$item.quantity_discount", 0] },
  { $ifNull: ["$item.coupon_discount", 0] },
] };
const paymentType = { $switch: {
  branches: [
    { case: { $eq: ["$is_partial_cod", true] }, then: "partial_cod" },
    { case: { $eq: ["$payment_method", "razorpay"] }, then: "prepaid" },
    { case: { $eq: ["$payment_method", "cod"] }, then: "cod" },
  ],
  default: "other",
} };
const PAYMENT_LABELS = { prepaid: "Prepaid (online)", cod: "Cash on delivery", partial_cod: "Partial COD", other: "Other" };

const baseMatch = (query) => {
  const { startDate, endDate } = dashboardHelper.resolveDateRange(query);
  return {
    match: { deleted_at: null, created_at: { $gte: startDate, $lte: endDate }, ...dashboardHelper.orderSegmentMatch(query) },
    startDate,
    endDate,
  };
};
const revenueMatch = (query) => {
  const base = baseMatch(query);
  return { ...base, match: { ...base.match, ...dashboardHelper.revenueStatusMatch } };
};
const searchMatch = (query, fields) => {
  const term = String(query.search || "").trim();
  if (!term) return null;
  const regex = new RegExp(escapeRegex(term), "i");
  return { $match: { $or: fields.map((field) => ({ [field]: regex })) } };
};
const pageOf = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit };
};

// Runs a grouped-row pipeline with totals, paginated for the admin table or
// in full for export.
const groupedReport = async (pipeline, query, { paginate, sort, totalsGroup }) => {
  if (!paginate) {
    const rows = await Order.aggregate([...pipeline, { $sort: sort }, { $limit: EXPORT_ROW_LIMIT + 1 }]).allowDiskUse(true);
    if (rows.length > EXPORT_ROW_LIMIT) throw StatusError.badRequest("This report has too many rows to export. Narrow the date range.");
    const [totals] = await Order.aggregate([...pipeline, { $group: { _id: null, ...totalsGroup } }]).allowDiskUse(true);
    return { rows, totals: totals || {} };
  }
  const { page, limit } = pageOf(query);
  const [result] = await Order.aggregate([
    ...pipeline,
    { $facet: {
      rows: [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }],
      count: [{ $count: "n" }],
      totals: [{ $group: { _id: null, ...totalsGroup } }],
    } },
  ]).allowDiskUse(true);
  const totalDocs = result.count[0]?.n || 0;
  return {
    rows: result.rows,
    totals: result.totals[0] || {},
    pagination: { page, limit, totalDocs, totalPages: Math.max(Math.ceil(totalDocs / limit), 1), hasNextPage: page * limit < totalDocs, hasPrevPage: page > 1 },
  };
};

// Order rows joined to their line items (revenue-counted orders only).
const lineItemStages = (query) => [
  { $match: revenueMatch(query).match },
  { $project: { _id: 1 } },
  { $lookup: { from: "order_items", localField: "_id", foreignField: "order_id", as: "item" } },
  { $unwind: "$item" },
];
const lineTotals = {
  units: { $sum: "$item.quantity" },
  net_sales: { $sum: lineNet },
  discounts: { $sum: lineDiscount },
  tax: { $sum: { $ifNull: ["$item.tax_amount", 0] } },
};

// ── Sales over time ─────────────────────────────────────────────────────────

const PERIOD_FORMATS = { day: "%Y-%m-%d", week: "%Y-%m-%d", month: "%Y-%m" };

// Every IST day / week (starting Monday) / month in the range, so the
// series has no gaps.
const listPeriods = (startDate, endDate, groupBy) => {
  const periods = [];
  const first = istYmd(startDate);
  const last = istYmd(endDate);
  if (groupBy === "month") {
    for (let key = first.slice(0, 7); key <= last.slice(0, 7) && periods.length < 1000; key = addMonthsYm(key, 1)) periods.push(key);
    return periods;
  }
  let key = first;
  if (groupBy === "week") key = addDaysYmd(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7)); // Monday
  for (; key <= last && periods.length < 1000; key = addDaysYmd(key, groupBy === "week" ? 7 : 1)) periods.push(key);
  return periods;
};

const salesReport = async (query) => {
  const groupBy = ["day", "week", "month"].includes(query.group_by) ? query.group_by : "day";
  const { match, startDate, endDate } = baseMatch(query);
  const periodDate = groupBy === "week"
    ? { $dateTrunc: { date: "$created_at", unit: "week", startOfWeek: "monday", timezone: STORE_TIMEZONE } }
    : "$created_at";
  const sums = {
    orders: sumIf(isRevenue, 1),
    items: sumIf(isRevenue, { $ifNull: ["$total_items", 0] }),
    gross_sales: sumIf(isRevenue, { $ifNull: ["$total_amount", 0] }),
    discounts: sumIf(isRevenue, { $ifNull: ["$discount", 0] }),
    shipping: sumIf(isRevenue, { $ifNull: ["$shipping", 0] }),
    cod_fees: sumIf(isRevenue, { $ifNull: ["$cod_fee", 0] }),
    net_sales: sumIf(isRevenue, "$grand_total"),
    refunds: sumIf({ $eq: ["$refund.status", "processed"] }, { $ifNull: ["$refund.amount", 0] }),
    cancelled_orders: sumIf({ $not: [isRevenue] }, 1),
    cancelled_value: sumIf({ $not: [isRevenue] }, "$grand_total"),
  };
  const [grouped, [totals = {}]] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: PERIOD_FORMATS[groupBy], date: periodDate, timezone: STORE_TIMEZONE } }, ...sums } },
    ]).allowDiskUse(true),
    Order.aggregate([{ $match: match }, { $group: { _id: null, ...sums } }]).allowDiskUse(true),
  ]);
  const byPeriod = new Map(grouped.map((row) => [row._id, row]));
  const rows = listPeriods(startDate, endDate, groupBy).map((period) => {
    const row = byPeriod.get(period) || {};
    const out = { period };
    for (const key of Object.keys(sums)) out[key] = round2(row[key]);
    out.avg_order_value = out.orders ? round2(out.net_sales / out.orders) : 0;
    return out;
  });
  totals.avg_order_value = totals.orders ? round2(totals.net_sales / totals.orders) : 0;
  return { rows, totals, meta: { group_by: groupBy } };
};

// ── Breakdowns ──────────────────────────────────────────────────────────────

const productsReport = (query, paginate) => groupedReport([
  ...lineItemStages(query),
  { $group: {
    _id: { product_id: "$item.product_id", variation_id: "$item.variation_id" },
    name: { $last: "$item.product_name" },
    variation_name: { $last: "$item.variation_name" },
    sku: { $last: "$item.sku" },
    order_ids: { $addToSet: "$_id" },
    ...lineTotals,
  } },
  { $lookup: { from: "products", localField: "_id.product_id", foreignField: "_id", as: "product" } },
  { $addFields: {
    name: { $ifNull: ["$name", { $arrayElemAt: ["$product.name", 0] }] },
    slug: { $arrayElemAt: ["$product.slug", 0] },
    orders: { $size: "$order_ids" },
  } },
  ...[searchMatch(query, ["name", "sku", "variation_name"])].filter(Boolean),
  { $project: { order_ids: 0, product: 0 } },
], query, { paginate, sort: { net_sales: -1, units: -1 }, totalsGroup: {
  units: { $sum: "$units" }, net_sales: { $sum: "$net_sales" }, discounts: { $sum: "$discounts" }, tax: { $sum: "$tax" },
} });

// A product in several categories counts toward each (WooCommerce
// Analytics convention, same as the dashboard category leaderboard), but the
// totals count every sale once so they match the products report.
const categoriesReport = async (query, paginate) => {
  const result = await categoryRows(query, paginate);
  const [totals] = await Order.aggregate([
    ...lineItemStages(query),
    { $group: { _id: null, units: { $sum: "$item.quantity" }, net_sales: { $sum: lineNet }, order_ids: { $addToSet: "$_id" } } },
    { $project: { _id: 0, units: 1, net_sales: 1, orders: { $size: "$order_ids" } } },
  ]).allowDiskUse(true);
  return { ...result, totals: totals || {} };
};

const categoryRows = (query, paginate) => groupedReport([
  ...lineItemStages(query),
  { $lookup: { from: "products", localField: "item.product_id", foreignField: "_id", as: "product" } },
  { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
  { $unwind: { path: "$product.categories", preserveNullAndEmptyArrays: true } },
  { $group: { _id: "$product.categories", order_ids: { $addToSet: "$_id" }, product_ids: { $addToSet: "$item.product_id" }, ...lineTotals } },
  { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
  { $addFields: {
    name: { $ifNull: [{ $arrayElemAt: ["$category.name", 0] }, "Uncategorised"] },
    orders: { $size: "$order_ids" },
    products: { $size: "$product_ids" },
  } },
  ...[searchMatch(query, ["name"])].filter(Boolean),
  { $project: { order_ids: 0, product_ids: 0, category: 0 } },
], query, { paginate, sort: { net_sales: -1 }, totalsGroup: { units: { $sum: "$units" }, net_sales: { $sum: "$net_sales" } } });

const brandsReport = (query, paginate) => groupedReport([
  ...lineItemStages(query),
  { $lookup: { from: "products", localField: "item.product_id", foreignField: "_id", as: "product" } },
  { $group: {
    _id: { $arrayElemAt: ["$product.brand", 0] },
    order_ids: { $addToSet: "$_id" },
    product_ids: { $addToSet: "$item.product_id" },
    ...lineTotals,
  } },
  { $lookup: { from: "brands", localField: "_id", foreignField: "_id", as: "brand" } },
  { $addFields: {
    name: { $ifNull: [{ $arrayElemAt: ["$brand.name", 0] }, "No brand"] },
    orders: { $size: "$order_ids" },
    products: { $size: "$product_ids" },
  } },
  ...[searchMatch(query, ["name"])].filter(Boolean),
  { $project: { order_ids: 0, product_ids: 0, brand: 0 } },
], query, { paginate, sort: { net_sales: -1 }, totalsGroup: {
  units: { $sum: "$units" }, net_sales: { $sum: "$net_sales" }, discounts: { $sum: "$discounts" }, tax: { $sum: "$tax" },
} });

const paymentMethodsReport = async (query) => {
  const rows = await Order.aggregate([
    { $match: revenueMatch(query).match },
    { $group: { _id: paymentType, orders: { $sum: 1 }, net_sales: { $sum: "$grand_total" }, advance_collected: { $sum: { $ifNull: ["$advance_amount", 0] } } } },
    { $sort: { net_sales: -1 } },
  ]);
  const totalNet = rows.reduce((sum, row) => sum + row.net_sales, 0);
  const totalOrders = rows.reduce((sum, row) => sum + row.orders, 0);
  return {
    rows: rows.map((row) => ({
      _id: row._id,
      name: PAYMENT_LABELS[row._id] || row._id,
      orders: row.orders,
      net_sales: round2(row.net_sales),
      avg_order_value: row.orders ? round2(row.net_sales / row.orders) : 0,
      advance_collected: round2(row.advance_collected),
      share: totalNet ? round2((row.net_sales / totalNet) * 100) : 0,
    })),
    totals: {
      orders: totalOrders,
      net_sales: round2(totalNet),
      avg_order_value: totalOrders ? round2(totalNet / totalOrders) : 0,
      advance_collected: round2(rows.reduce((sum, row) => sum + row.advance_collected, 0)),
      share: totalNet ? 100 : 0,
    },
  };
};

const couponsReport = (query, paginate) => groupedReport([
  { $match: { ...revenueMatch(query).match, coupon_code: { $nin: [null, ""] } } },
  { $group: {
    _id: { $toUpper: "$coupon_code" },
    orders: { $sum: 1 },
    discounts: { $sum: { $ifNull: ["$discount", 0] } },
    net_sales: { $sum: "$grand_total" },
    customers: { $addToSet: "$user" },
  } },
  { $addFields: {
    name: "$_id",
    customers: { $size: "$customers" },
    avg_order_value: { $cond: [{ $gt: ["$orders", 0] }, { $round: [{ $divide: ["$net_sales", "$orders"] }, 2] }, 0] },
  } },
  ...[searchMatch(query, ["name"])].filter(Boolean),
], query, { paginate, sort: { orders: -1, net_sales: -1 }, totalsGroup: {
  orders: { $sum: "$orders" }, discounts: { $sum: "$discounts" }, net_sales: { $sum: "$net_sales" },
} });

// ── Registry ────────────────────────────────────────────────────────────────

const money = (key, header) => ({ key, header, kind: "money" });
const int = (key, header) => ({ key, header, kind: "int" });
const text = (key, header) => ({ key, header, kind: "text" });

export const REPORTS = {
  sales: {
    title: "Sales over time",
    description: "Orders and revenue per day, week or month. Gross sales is the item subtotal; net sales is what customers paid (after coupons, incl. shipping and COD fees). Cancelled, failed and returned orders are excluded and shown separately.",
    columns: [
      text("period", "Period"), int("orders", "Orders"), int("items", "Items"),
      money("gross_sales", "Gross sales"), money("discounts", "Coupon discounts"), money("shipping", "Shipping"),
      money("cod_fees", "COD fees"), money("net_sales", "Net sales"), money("avg_order_value", "Avg. order value"),
      money("refunds", "Refunds"), int("cancelled_orders", "Cancelled / returned"), money("cancelled_value", "Cancelled value"),
    ],
    run: salesReport,
  },
  products: {
    title: "Products",
    description: "Units sold and net sales per product and variation.",
    columns: [
      text("name", "Product"), text("variation_name", "Variation"), text("sku", "SKU"),
      int("units", "Units sold"), int("orders", "Orders"), money("discounts", "Discounts (sale + coupon)"), money("tax", "GST"), money("net_sales", "Net sales"),
    ],
    searchable: true,
    run: productsReport,
  },
  categories: {
    title: "Categories",
    description: "Sales per category. A product in several categories counts toward each of them; the total counts every sale once.",
    columns: [text("name", "Category"), int("products", "Products sold"), int("units", "Units sold"), int("orders", "Orders"), money("net_sales", "Net sales")],
    searchable: true,
    run: categoriesReport,
  },
  brands: {
    title: "Brands",
    description: "Sales per brand.",
    columns: [
      text("name", "Brand"), int("products", "Products sold"), int("units", "Units sold"), int("orders", "Orders"),
      money("discounts", "Discounts (sale + coupon)"), money("tax", "GST"), money("net_sales", "Net sales"),
    ],
    searchable: true,
    run: brandsReport,
  },
  payment_methods: {
    title: "Payment methods",
    description: "How customers pay: orders, revenue and share per payment method.",
    columns: [
      text("name", "Payment method"), int("orders", "Orders"), money("net_sales", "Net sales"),
      money("avg_order_value", "Avg. order value"), money("advance_collected", "Advance collected"), { key: "share", header: "Share of sales", kind: "pct" },
    ],
    run: paymentMethodsReport,
  },
  coupons: {
    title: "Coupons",
    description: "Coupon usage, discount given and the sales it drove.",
    columns: [
      text("name", "Coupon"), int("orders", "Orders"), int("customers", "Customers"),
      money("discounts", "Discount given"), money("net_sales", "Net sales"), money("avg_order_value", "Avg. order value"),
    ],
    searchable: true,
    run: couponsReport,
  },
};

const reportFor = (type) => {
  const report = REPORTS[type];
  if (!report) throw StatusError.notFound("Unknown report.");
  return report;
};

const roundRow = (columns, row) => {
  const out = { ...row };
  if (out._id === null) delete out._id;
  for (const { key, kind } of columns) if (kind === "money" || kind === "pct") out[key] = round2(out[key]);
  return out;
};

export const listReports = () => Object.entries(REPORTS).map(([type, r]) => ({
  type, title: r.title, description: r.description, columns: r.columns, searchable: !!r.searchable,
}));

export const runReport = async (type, query = {}) => {
  const report = reportFor(type);
  const { startDate, endDate } = dashboardHelper.resolveDateRange(query);
  const result = await report.run(query, true);
  return {
    type,
    title: report.title,
    description: report.description,
    columns: report.columns,
    range: { from: startDate, to: endDate },
    rows: result.rows.map((row) => roundRow(report.columns, row)),
    totals: roundRow(report.columns, result.totals || {}),
    pagination: result.pagination || null,
    meta: result.meta || {},
  };
};

export const buildReportWorkbook = async (type, query = {}) => {
  const report = reportFor(type);
  const { startDate, endDate } = dashboardHelper.resolveDateRange(query);
  const result = await report.run(query, false);
  if (!result.rows.length) throw StatusError.badRequest("This report has no data for the selected period.");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(report.title.slice(0, 31));
  sheet.addRow([`${report.title} — ${istYmd(startDate)} to ${istYmd(endDate)} (IST)`]).font = { bold: true, size: 13 };
  sheet.addRow([]);
  const header = sheet.addRow(report.columns.map((c) => c.header));
  header.font = { bold: true };
  const formats = { money: "#,##0.00", int: "#,##0", pct: "0.00\"%\"" };
  for (const row of result.rows) {
    const r = roundRow(report.columns, row);
    sheet.addRow(report.columns.map((c) => (c.kind === "text" ? (r[c.key] ?? "") : Number(r[c.key]) || 0)));
  }
  const totals = roundRow(report.columns, result.totals || {});
  const totalRow = sheet.addRow(report.columns.map((c, i) => (i === 0 ? "Total" : c.kind === "text" ? "" : Number(totals[c.key]) || 0)));
  totalRow.font = { bold: true };
  report.columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = c.kind === "text" ? (c.key === "name" ? 40 : 18) : 16;
    if (formats[c.kind]) column.numFmt = formats[c.kind];
  });
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  return { workbook, count: result.rows.length };
};
