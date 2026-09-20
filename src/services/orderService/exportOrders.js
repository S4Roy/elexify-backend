import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Order from "../../models/Order.js";
import { sourceExpression } from "../legacyImport/filter.js";
import { StatusError } from "../../config/index.js";

// A hard ceiling on rows per export, the same way every mainstream
// e-commerce admin (Shopify, WooCommerce) caps a single export file instead
// of trying to stream an unbounded dataset into one spreadsheet — the
// admin narrows the filter (usually by date range) and exports again.
export const ORDER_EXPORT_ROW_LIMIT = 20000;

const COLUMNS = [
  { header: "Order ID", key: "id", width: 18 },
  { header: "Order Date", key: "created_at", width: 20, style: { numFmt: "yyyy-mm-dd hh:mm" } },
  { header: "Customer Name", key: "customer_name", width: 24 },
  { header: "Customer Email", key: "customer_email", width: 28 },
  { header: "Customer Phone", key: "customer_phone", width: 16 },
  { header: "Order Status", key: "order_status", width: 18 },
  { header: "Payment Status", key: "payment_status", width: 16 },
  { header: "Payment Method", key: "payment_method", width: 16 },
  { header: "Total Items", key: "total_items", width: 12 },
  { header: "Grand Total", key: "grand_total", width: 14, style: { numFmt: "#,##0.00" } },
  { header: "Currency", key: "currency", width: 10 },
  { header: "Shiprocket Order ID", key: "shiprocket_order_id", width: 20 },
  { header: "Imported From Backup", key: "imported_from_backup", width: 18 },
];

// Counts the matching set first so an oversized export fails fast with a
// clear message instead of hanging on an unbounded aggregation.
export const countOrdersForExport = async (matchFilter, orderIds) => {
  const finalFilter = orderIds?.length ? { ...matchFilter, id: { $in: orderIds } } : matchFilter;
  return Order.countDocuments(finalFilter);
};

const fetchRowsForExport = async (matchFilter, orderIds, sortBy, sortOrder) => {
  const finalFilter = orderIds?.length ? { ...matchFilter, id: { $in: orderIds } } : matchFilter;
  const pipeline = [
    { $match: finalFilter },
    { $addFields: { imported_from_backup: sourceExpression([]) } },
    { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    { $sort: { [sortBy]: sortOrder } },
    { $limit: ORDER_EXPORT_ROW_LIMIT },
    {
      $project: {
        _id: 0,
        id: 1,
        created_at: 1,
        // Mirrors helpers/order/customerContact.js: a linked account's own
        // details first, then the order's billing/shipping snapshot — the
        // billing/shipping fields on a guest order, never a live account.
        customer_name: { $ifNull: ["$user.name", { $ifNull: ["$billing_address_snapshot.full_name", "$shipping_address_snapshot.full_name"] }] },
        customer_email: { $ifNull: ["$user.email", { $ifNull: ["$billing_address_snapshot.email", "$shipping_address_snapshot.email"] }] },
        customer_phone: { $ifNull: ["$user.mobile", { $ifNull: ["$billing_address_snapshot.phone", "$shipping_address_snapshot.phone"] }] },
        order_status: 1,
        payment_status: 1,
        payment_method: 1,
        total_items: 1,
        grand_total: 1,
        currency: 1,
        shiprocket_order_id: 1,
        imported_from_backup: 1,
      },
    },
  ];
  return Order.aggregate(pipeline);
};

/**
 * Builds the Orders export workbook — same shape as the admin Orders list
 * table, scoped either to the current filter/search (matchFilter) or to a
 * specific set of hand-picked rows (orderIds), matching the "export what
 * I'm looking at" vs. "export what I selected" split every mainstream
 * e-commerce admin offers.
 */
export const buildOrdersExportWorkbook = async ({ matchFilter, orderIds, sortBy = "id", sortOrder = -1 }) => {
  const total = await countOrdersForExport(matchFilter, orderIds);
  if (!total) throw StatusError.badRequest("No orders match the current filters to export.");
  if (total > ORDER_EXPORT_ROW_LIMIT) {
    throw StatusError.badRequest(`This export would include ${total} orders, over the ${ORDER_EXPORT_ROW_LIMIT} limit. Narrow the filters (e.g. by date range) and try again.`);
  }
  const rows = await fetchRowsForExport(matchFilter, orderIds, sortBy, sortOrder);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elexify Admin";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Orders", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  for (const row of rows) {
    sheet.addRow({
      ...row,
      customer_name: row.customer_name || "Unnamed customer",
      customer_email: row.customer_email || "",
      customer_phone: row.customer_phone || "",
      shiprocket_order_id: row.shiprocket_order_id || "",
      imported_from_backup: row.imported_from_backup ? "Yes" : "No",
    });
  }

  return { workbook, count: rows.length };
};
