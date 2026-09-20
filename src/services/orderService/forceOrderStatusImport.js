import { resolveImportOrder } from "./resolveImportOrder.js";
import Order from '../../models/Order.js';
import { normalizeOrderStatus } from '../../helpers/order/normalizeOrderStatus.js';

const exportStatuses = {
  rto_delivered: 'returned', rto_acknowledged: 'returned', lost: 'failed',
  rto_in_transit: 'return_requested', rto_ofd: 'return_requested',
  'in_transit-en-route': 'shipped', reached_destination_hub: 'shipped',
};
export const fileOrderStatus = value => {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  return exportStatuses[key] || normalizeOrderStatus(value);
};

export const auditForceOrderStatusImport = async rows => {
  const report = { apply: false, counters: { total_rows: rows.length, skipped_missing_fields: 0, unsupported_status: 0, package_matched_updated: 0, package_matched_noop: 0, order_matched_updated: 0, order_matched_noop: 0, order_matched_blocked: 0, unmatched: 0 }, applied: [], blocked: [], unmatched: [] };
  const candidates = [];
  const grouped = new Map();
  for (const row of rows) {
    const reference = String(row['Order ID'] ?? row.shiprocket_order_id ?? '').trim();
    const rawStatus = String(row.Status ?? row.status ?? '').trim();
    if (!reference || !rawStatus) { report.counters.skipped_missing_fields++; continue; }
    const group = grouped.get(reference) || [];
    group.push({ rawStatus, status: fileOrderStatus(rawStatus), channel: row.Channel ?? row.channel ?? '' });
    grouped.set(reference, group);
  }
  for (const [reference, group] of grouped) {
    if (new Set(group.map(row => row.status)).size > 1) {
      report.counters.order_matched_blocked++;
      report.blocked.push({ shiprocket_order_id: reference, order_id: reference, reason: 'Conflicting statuses for this order ID in the file.' });
      continue;
    }
    report.counters.skipped_missing_fields += group.length - 1;
    const row = group[0];
    if (!row.status) { report.counters.unsupported_status++; continue; }
    let match;
    try { match = await resolveImportOrder(reference); }
    catch (error) {
      report.counters.order_matched_blocked++;
      report.blocked.push({ shiprocket_order_id: reference, order_id: reference, reason: error.message });
      continue;
    }
    const order = match?.order;
    if (!order) {
      report.counters.unmatched++;
      report.unmatched.push({ shiprocket_order_id: reference, status: row.rawStatus, channel: row.channel });
      continue;
    }
    if (order.order_status === row.status) { report.counters.order_matched_noop++; continue; }
    candidates.push({ reference, orderId: String(order._id), localOrderId: order.id, matchedBy: match.matchedBy, status: row.status, expectedStatus: order.order_status, rawStatus: row.rawStatus });
    report.counters.order_matched_updated++;
    report.applied.push({ type: 'order', shiprocket_order_id: reference, order_id: order.id, matched_by: match.matchedBy, from: order.order_status, to: row.status });
  }
  return { report, candidates };
};

// Intentional admin override: no payment/shipment preconditions, no provider
// calls, no stock/payment/refund operations and no customer notifications.
// Only the parent order label is overridden; package tracking stays factual.
export const applyForceOrderStatusRow = async (candidate, adminId, filename) => {
  if (!adminId || fileOrderStatus(candidate.status) !== candidate.status) throw Error('Invalid forced status update.');
  const match = await resolveImportOrder(candidate.reference);
  if (!match || String(match.order._id) !== String(candidate.orderId)) throw Error('Order reference changed since preview. Run a fresh preview.');
  const now = new Date();
  const updated = await Order.findOneAndUpdate({
    _id: candidate.orderId, id: candidate.localOrderId || candidate.reference, deleted_at: null, order_status: candidate.expectedStatus,
  }, {
    $set: { order_status: candidate.status, updated_at: now },
    $push: { manual_status_history: {
      from: candidate.expectedStatus, to: candidate.status, changed_by: adminId, changed_at: now,
      reason: `Forced order status from admin upload "${filename}" (reference: ${candidate.reference}; file status: ${candidate.rawStatus}); order label only`,
    } },
  }, { new: true, runValidators: true });
  if (!updated) throw Error('Order changed since preview or was deleted. Run a fresh preview.');
  return updated;
};
