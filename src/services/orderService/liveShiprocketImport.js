import { isHistoricalImportedOrder } from "./historicalDelivery.js";
import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { returnApi } from '../shiprocket/returnShipment.js';
import { normalizeOrderStatus } from '../../helpers/order/normalizeOrderStatus.js';
import { registerExternalPackage } from './packages/registerExternalPackage.js';
import { syncShiprocketStatus } from './packages/syncShiprocketStatus.js';

const channelKey = value => String(value || '').trim().toUpperCase();
const shipmentOf = remote => {
  const shipments = Array.isArray(remote?.shipments) ? remote.shipments : remote?.shipments ? [remote.shipments] : [];
  if (shipments.length !== 1) throw Error('Expected exactly one shipment; review this order individually.');
  return shipments[0];
};
export const verifyDeliveredRemote = (remote, reference, channel) => {
  if (!remote?.id || String(remote.channel_order_id).trim() !== reference || (channel && channelKey(remote.channel_name) !== channelKey(channel))) {
    throw Error('Shiprocket order reference or channel does not match the CSV.');
  }
  const shipment = shipmentOf(remote);
  if (!shipment.id || normalizeOrderStatus(shipment.current_status || remote.status) !== 'delivered') {
    throw Error('Live Shiprocket status is not delivered.');
  }
  return shipment;
};
const eligible = order => {
  if (!order || ['cancelled', 'returned', 'return_requested', 'failed'].includes(order.order_status) || order.inventory_reverted || (order.refund?.status && order.refund.status !== 'not_required')) {
    throw Error('Order is missing or has cancellation, return, failure or refund effects.');
  }
  if (order.replacement_return_id) throw Error("Reconcile replacement orders through the return workflow.");
  if ((order.payment_method === 'razorpay' || order.is_partial_cod) && !['paid', 'advance_paid'].includes(order.payment_status) && !isHistoricalImportedOrder(order) && order.order_status !== 'delivered') throw Error('Record payment in Order Details before advancing fulfillment. This order is not a historical import.');
};

// Accept both the provider export and our own downloaded unmatched report.
export const normalizeImportRows = rows => rows.map(row => ({
  ...row,
  'Order ID': row['Order ID'] ?? row.shiprocket_order_id,
  Status: row.Status ?? row.status,
  Channel: row.Channel ?? row.channel,
}));

// Explicit calendar months include historical shipments instead of relying on
// the provider's default listing date window. Do not parse locale dates with Date.
export const importDateWindows = rows => {
  const months = new Map();
  let missingDate = false;
  for (const row of rows) {
    if (String(row.Status).trim().toUpperCase() !== 'DELIVERED') continue;
    const date = String(row['Shiprocket Created At'] || '').trim();
    const match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
    if (!match) { missingDate = true; continue; }
    const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw Error('Invalid Shiprocket Created At date; expected M/D/YYYY.');
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    months.set(prefix, { from: `${prefix}-01`, to: `${prefix}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` });
  }
  return [...months.values(), ...(missingDate || !months.size ? [{}] : [])];
};

export const findRemoteReference = async (reference, dateWindow = {}) => {
  const matches = [];
  for (let page = 1; ; page++) {
    const response = await returnApi('GET', 'orders', { ...dateWindow, filter_by: 'channel_order_id', filter: reference, page, per_page: 100 });
    if (!Array.isArray(response.data)) throw Error('Invalid Shiprocket lookup response.');
    matches.push(...response.data.filter(remote => String(remote.channel_order_id).trim() === reference));
    const pages = Number(response.meta?.pagination?.total_pages);
    if (!Number.isInteger(pages) || pages < 0) throw Error('Shiprocket lookup pagination is missing.');
    if (page >= pages) return matches;
    if (page >= 1000) throw Error('Shiprocket reference lookup exceeds the scan limit.');
  }
};

// Read every page before resolving identities: duplicate channel references must
// never be resolved by selecting whichever result happened to arrive first.
export const auditLiveShiprocketImport = async inputRows => {
  const rows = normalizeImportRows(inputRows);
  const references = new Set(rows.filter(row => String(row.Status).trim().toUpperCase() === 'DELIVERED').map(row => String(row['Order ID'] || '').trim()));
  const remoteByReference = new Map();
  if (references.size) {
    for (const window of importDateWindows(rows)) {
    for (let page = 1; ; page++) {
      const response = await returnApi('GET', 'orders', { ...window, page, per_page: 100 });
      if (!Array.isArray(response.data)) throw Error('Invalid Shiprocket order list response.');
      for (const remote of response.data) {
        const reference = String(remote.channel_order_id).trim();
        if (references.has(reference)) remoteByReference.set(reference, [...(remoteByReference.get(reference) || []), remote]);
      }
      const pages = Number(response.meta?.pagination?.total_pages);
      if (!Number.isInteger(pages) || pages < 0) throw Error('Shiprocket pagination is missing; unable to verify unique matches.');
      if (page >= pages) break;
      if (page >= 1000) throw Error('Shiprocket account exceeds the import scan limit.');
    }
    }
  }
  const report = { apply: false, counters: { total_rows: rows.length, skipped_missing_fields: 0, unsupported_status: 0, package_matched_updated: 0, package_matched_noop: 0, order_matched_updated: 0, order_matched_noop: 0, order_matched_blocked: 0, unmatched: 0 }, applied: [], blocked: [], unmatched: [] };
  const candidates = [];
  const seen = new Set();
  for (const row of rows) {
    const reference = String(row['Order ID'] || '').trim();
    const channel = String(row.Channel || '').trim();
    if (!reference || !row.Status) { report.counters.skipped_missing_fields++; continue; }
    if (String(row.Status).trim().toUpperCase() !== 'DELIVERED') { report.counters.unsupported_status++; continue; }
    if (seen.has(reference)) { report.counters.skipped_missing_fields++; continue; }
    seen.add(reference);
    try {
      const pkg = await Package.findOne({ reference_id: reference });
      const order = pkg ? await Order.findOne({ _id: pkg.order_id, deleted_at: null }) : await Order.findOne({ id: reference, deleted_at: null });
      if (!order) {
        report.counters.unmatched++;
        report.unmatched.push({ shiprocket_order_id: reference, status: row.Status, channel });
        continue;
      }
      eligible(order);
      if (pkg && ['cancelled', 'returned', 'return_requested', 'failed'].includes(pkg.status)) throw Error('Package has a blocked status.');
      let available = remoteByReference.get(reference) || [];
      const existingLink = pkg?.shiprocket_order_id || order.shiprocket_order_id;
      if (!available.length && existingLink) {
        const remote = (await returnApi('GET', `orders/show/${encodeURIComponent(existingLink)}`)).data;
        if (String(remote?.channel_order_id).trim() === reference) available = [remote];
      }
      if (!available.length) available = await findRemoteReference(reference);
      const unique = [...new Map(available.map(remote => [String(remote.id), remote])).values()];
      const matches = unique.filter(remote => !channel || channelKey(remote.channel_name) === channelKey(channel));
      if (!matches.length) {
        if (unique.length) throw Error(`Channel mismatch: CSV says "${channel}"; Shiprocket reports "${unique.map(remote => remote.channel_name || '(missing)').join(', ')}". Check the export channel.`);
        throw Error(`Reference "${reference}" was not found in the connected Shiprocket account. Check the API account and export dates, or link its internal Shiprocket order ID in Order Details.`);
      }
      if (matches.length !== 1) throw Error('Multiple Shiprocket orders match this reference and channel.');
      const remote = matches[0];
      verifyDeliveredRemote(remote, reference, channel);
      const linkedId = pkg?.shiprocket_order_id || order.shiprocket_order_id;
      if (linkedId && String(linkedId) !== String(remote.id)) throw Error('Existing Shiprocket link conflicts with the verified order.');
      if (!pkg && !linkedId && await Package.exists({ order_id: order._id })) throw Error('Order already has packages; reconcile each package individually.');
      const candidate = { reference, channel, orderId: String(order._id), shiprocketOrderId: String(remote.id), packageId: pkg ? String(pkg._id) : null };
      candidates.push(candidate);
      report.counters[pkg ? 'package_matched_updated' : 'order_matched_updated']++;
      report.applied.push({ type: pkg ? 'package' : 'order', shiprocket_order_id: reference, order_id: order.id, from: pkg?.status || order.order_status, to: 'delivered' });
    } catch (error) {
      report.counters.order_matched_blocked++;
      report.blocked.push({ shiprocket_order_id: reference, order_id: reference, reason: error.message });
    }
  }
  return { report, candidates };
};

export const applyLiveShiprocketRow = async (candidate, adminId) => {
  const order = await Order.findOne({ _id: candidate.orderId, deleted_at: null });
  eligible(order);
  const remote = (await returnApi('GET', `orders/show/${encodeURIComponent(candidate.shiprocketOrderId)}`)).data;
  verifyDeliveredRemote(remote, candidate.reference, candidate.channel);
  if (String(remote.id) !== candidate.shiprocketOrderId) throw Error("Shiprocket returned a different order ID.");
  const pkg = candidate.packageId ? await Package.findOne({ _id: candidate.packageId, order_id: order._id }) : null;
  if (candidate.packageId && (!pkg || String(pkg.shiprocket_order_id) !== candidate.shiprocketOrderId || ['cancelled', 'returned', 'return_requested', 'failed'].includes(pkg.status))) throw Error('Package changed since preview; upload again.');
  if (!pkg && await Package.exists({ order_id: order._id })) throw Error('Order now has packages; upload a fresh preview.');
  const linkedId = pkg?.shiprocket_order_id || order.shiprocket_order_id;
  if (linkedId && String(linkedId) !== candidate.shiprocketOrderId) throw Error('Shiprocket link changed since preview.');
  if (!linkedId) {
    await registerExternalPackage({ orderId: order._id, shiprocketOrderId: candidate.shiprocketOrderId, reason: 'Delivered shipment verified through admin CSV import; payment status unchanged', adminId, legacyDeliveredImport: true });
  } else {
    // Scope to this verified shipment; a CSV row never advances sibling parcels.
    const result = await syncShiprocketStatus({ orderId: order._id, adminId, shiprocketOrderId: candidate.shiprocketOrderId, notify: false, verifiedRemote: remote });
    if (result.results.some(item => item.error)) throw Error(result.results.find(item => item.error).error);
  }
};
