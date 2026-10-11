import moment from "moment-timezone";
import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { transitionOrder } from "./transitionOrder.js";

// COD delivered by a courier: the customer has paid (the courier holds the
// cash), so the order is "paid" at delivery — but the money only reaches us
// when Shiprocket remits it, days later. order.cod_remittance tracks that
// second leg: "awaiting" at delivery, then "remitted"/"partially_remitted"
// as Shiprocket's COD remittance report is imported (importCodRemittance).
// Own-rider/store COD is settled in hand via order.cod_collection instead
// (packages/manualFulfillment.js) and never awaits a remittance.

const paise = (amount) => Math.round(Number(amount || 0) * 100);

// Amount the courier collects at the door: the whole order for full COD,
// the balance after the online advance for Partial COD.
export const courierCodAmount = (order) =>
  order.is_partial_cod ? Number(order.cod_due_amount) || 0 : Number(order.grand_total) || 0;

const awaitsCourierCollection = (order) =>
  order.payment_method === "cod" &&
  (order.payment_status === "advance_paid" || (!order.is_partial_cod && order.payment_status === "pending"));

/**
 * Payment side-effects of a confirmed carrier delivery, or null when the
 * order has nothing left to collect. Callers merge `set` into the same
 * transitionOrder call that records the delivery.
 */
export const codSettlementOnDelivery = (order, at = new Date()) => {
  if (!awaitsCourierCollection(order)) return null;
  return {
    paymentStatus: "paid",
    set: {
      paid_at: order.paid_at && order.payment_status !== "advance_paid" ? order.paid_at : at,
      cod_remittance: {
        status: "awaiting",
        expected_amount: courierCodAmount(order),
        remitted_amount: 0,
        entries: [],
        delivered_at: at,
      },
    },
  };
};

// ── Remittance report import ────────────────────────────────────────────
// Shiprocket's COD remittance export names its columns differently across
// report versions; accept the common spellings.
const COLUMN_ALIASES = {
  awb: ["awb", "awb code", "awb no", "awb number", "tracking id"],
  order_ref: ["order id", "channel order id", "order number"],
  amount: ["remitted amount", "cod amount", "remittance amount", "amount", "net amount"],
  utr: ["utr", "utr no", "utr number", "bank reference", "bank ref no"],
  remitted_at: ["remittance date", "remitted on", "remitted date", "date", "payment date"],
  remittance_id: ["crf id", "remittance id", "batch id"],
};

const pick = (row, field) => {
  const keys = Object.keys(row);
  for (const alias of COLUMN_ALIASES[field]) {
    const key = keys.find((k) => k.trim().toLowerCase() === alias);
    if (key != null && String(row[key] ?? "").trim() !== "") return String(row[key]).trim();
  }
  return null;
};

const parseAmount = (value) => {
  const n = Number(String(value ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Indian reports are day-first; never let Date() read "05-10-2026" as May.
const DATE_FORMATS = ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD", "DD-MM-YYYY HH:mm:ss", "DD-MM-YYYY", "DD/MM/YYYY", "D MMM YYYY", "DD MMM YYYY"];
const parseDate = (value) => {
  if (!value) return null;
  const m = moment.tz(String(value).trim(), DATE_FORMATS, true, "Asia/Kolkata");
  return m.isValid() ? m.toDate() : null;
};

export const normalizeRemittanceRows = (rows) =>
  rows.map((row, index) => ({
    row: index + 2, // header is row 1 in the uploaded sheet
    awb: pick(row, "awb"),
    order_ref: pick(row, "order_ref"),
    amount: parseAmount(pick(row, "amount")),
    utr: pick(row, "utr"),
    remitted_at: parseDate(pick(row, "remitted_at")),
    remittance_id: pick(row, "remittance_id"),
  }));

// Our own package reference is "<order id>-P<n>"; strip it back to the order.
const orderIdFromRef = (ref) => (ref ? ref.replace(/-P\d+$/i, "") : null);

const findOrder = async (line) => {
  if (line.awb) {
    const pkg = await Package.findOne({ awb: line.awb }).select("order_id").lean();
    if (pkg) return Order.findOne({ _id: pkg.order_id, deleted_at: null });
    const legacy = await Order.findOne({ awb: line.awb, deleted_at: null });
    if (legacy) return legacy;
  }
  const id = orderIdFromRef(line.order_ref);
  return id ? Order.findOne({ id, deleted_at: null }) : null;
};

const entryKey = (line) => `${line.awb || line.order_ref}|${line.utr || line.remittance_id || ""}`;

const recordRemittance = async ({ order, orderLines, expected, total, status, discrepancy, adminId }) => {
  const now = new Date();
  const entries = orderLines.map((l) => ({
    key: l.key, awb: l.awb, amount: l.amount, utr: l.utr, remittance_id: l.remittance_id,
    remitted_at: l.remitted_at || now, recorded_by: adminId, recorded_at: now,
  }));
  const lastRemittedAt = entries.reduce((max, e) => (e.remitted_at > max ? e.remitted_at : max), entries[0].remitted_at);
  const set = {
    "cod_remittance.status": status,
    "cod_remittance.expected_amount": expected,
    "cod_remittance.remitted_amount": Math.round(total * 100) / 100,
    "cod_remittance.discrepancy": discrepancy,
    "cod_remittance.remitted_at": lastRemittedAt,
    ...(order.cod_remittance?.delivered_at ? {} : { "cod_remittance.delivered_at": order.delivered_at || null }),
  };
  // Older delivered COD orders never got marked paid on delivery; the
  // remittance itself proves the customer paid.
  const settlement = codSettlementOnDelivery(order, order.delivered_at || lastRemittedAt);
  if (settlement) {
    await transitionOrder({ orderId: order._id, paymentStatus: "paid", set: { paid_at: settlement.set.paid_at }, source: "remittance" });
  }
  await Order.updateOne(
    { _id: order._id, "cod_remittance.entries.key": { $nin: entries.map((e) => e.key) } },
    { $set: set, $push: { "cod_remittance.entries": { $each: entries } } },
  );
};

/**
 * Matches each remittance row to an order and classifies it. With
 * apply=false (default) nothing is written. With apply=true every "ready"
 * row is recorded on the order; re-importing the same report is a no-op
 * (rows are keyed by AWB + UTR).
 */
export const importCodRemittance = async ({ rows, apply = false, adminId = null }) => {
  const lines = normalizeRemittanceRows(rows);
  const results = [];
  const byOrder = new Map();

  for (const line of lines) {
    const base = { row: line.row, awb: line.awb, order_ref: line.order_ref, amount: line.amount, utr: line.utr };
    if ((!line.awb && !line.order_ref) || !Number.isFinite(line.amount) || line.amount <= 0) {
      results.push({ ...base, outcome: "invalid_row", reason: "Needs an AWB or Order ID and a positive amount" });
      continue;
    }
    const order = await findOrder(line);
    if (!order) { results.push({ ...base, outcome: "unmatched" }); continue; }
    const ref = { ...base, order_id: order.id, order_entity_id: String(order._id) };
    if (order.payment_method !== "cod") { results.push({ ...ref, outcome: "not_cod" }); continue; }
    if (!["delivered", "partially_delivered", "return_requested", "returned"].includes(order.order_status)) {
      results.push({ ...ref, outcome: "not_delivered", reason: `Order is "${order.order_status}"` });
      continue;
    }
    if (order.cod_collection) {
      results.push({ ...ref, outcome: "collected_in_store", reason: "COD was collected by our own staff" });
      continue;
    }
    const key = entryKey(line);
    if ((order.cod_remittance?.entries || []).some((e) => e.key === key)) {
      results.push({ ...ref, outcome: "already_recorded" });
      continue;
    }
    const group = byOrder.get(String(order._id)) || { order, lines: [] };
    group.lines.push({ ...line, key, result: ref });
    byOrder.set(String(order._id), group);
  }

  for (const { order, lines: orderLines } of byOrder.values()) {
    const expected = order.cod_remittance?.expected_amount ?? courierCodAmount(order);
    const already = order.cod_remittance?.remitted_amount || 0;
    const total = already + orderLines.reduce((sum, l) => sum + l.amount, 0);
    const status = paise(total) >= paise(expected) ? "remitted" : "partially_remitted";
    const discrepancy = paise(total) !== paise(expected) ? Math.round((total - expected) * 100) / 100 : 0;
    const outcome = discrepancy === 0 ? "ready" : discrepancy < 0 ? "short" : "excess";
    for (const l of orderLines) results.push({ ...l.result, outcome, expected_amount: expected, total_remitted: total, discrepancy });

    if (!apply) continue;
    try {
      await recordRemittance({ order, orderLines, expected, total, status, discrepancy, adminId });
    } catch (error) {
      for (const r of results) if (r.order_entity_id === String(order._id) && r.outcome === outcome) {
        r.outcome = "failed"; r.reason = error.message;
      }
    }
  }

  const summary = results.reduce((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] || 0) + 1 }), {});
  const recordable = results.filter((r) => ["ready", "short", "excess"].includes(r.outcome));
  return {
    applied: apply,
    total_rows: lines.length,
    summary,
    recordable_rows: recordable.length,
    recordable_amount: Math.round(recordable.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    results: results.sort((a, b) => a.row - b.row),
  };
};

/**
 * Money delivered by courier but not yet remitted to us. `overdueDays`
 * flags deliveries older than Shiprocket's usual remittance cycle.
 */
export const codRemittanceSummary = async ({ overdueDays = 10, limit = 100 } = {}) => {
  const overdueBefore = new Date(Date.now() - overdueDays * 86400000);
  const pendingMatch = { deleted_at: null, "cod_remittance.status": { $in: ["awaiting", "partially_remitted"] } };
  const outstanding = { $subtract: ["$cod_remittance.expected_amount", { $ifNull: ["$cod_remittance.remitted_amount", 0] }] };
  const [totals] = await Order.aggregate([
    { $match: pendingMatch },
    { $group: {
      _id: null,
      awaiting_count: { $sum: 1 },
      awaiting_amount: { $sum: outstanding },
      overdue_count: { $sum: { $cond: [{ $lt: ["$cod_remittance.delivered_at", overdueBefore] }, 1, 0] } },
      overdue_amount: { $sum: { $cond: [{ $lt: ["$cod_remittance.delivered_at", overdueBefore] }, outstanding, 0] } },
    } },
  ]);
  const discrepancies = await Order.countDocuments({ deleted_at: null, "cod_remittance.discrepancy": { $nin: [0, null] } });
  const orders = await Order.find(pendingMatch)
    .sort({ "cod_remittance.delivered_at": 1 })
    .limit(limit)
    .select("id awb grand_total currency cod_remittance.status cod_remittance.expected_amount cod_remittance.remitted_amount cod_remittance.delivered_at")
    .lean();
  return {
    overdue_days: overdueDays,
    awaiting_count: totals?.awaiting_count || 0,
    awaiting_amount: Math.round((totals?.awaiting_amount || 0) * 100) / 100,
    overdue_count: totals?.overdue_count || 0,
    overdue_amount: Math.round((totals?.overdue_amount || 0) * 100) / 100,
    discrepancy_count: discrepancies,
    orders: orders.map((o) => ({
      _id: o._id, id: o.id, awb: o.awb || null, currency: o.currency || "INR",
      status: o.cod_remittance.status,
      outstanding: Math.round(((o.cod_remittance.expected_amount || 0) - (o.cod_remittance.remitted_amount || 0)) * 100) / 100,
      delivered_at: o.cod_remittance.delivered_at || null,
      overdue: !!o.cod_remittance.delivered_at && new Date(o.cod_remittance.delivered_at) < overdueBefore,
    })),
  };
};
