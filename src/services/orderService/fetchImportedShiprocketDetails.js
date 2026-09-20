import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { resolveImportOrder } from './resolveImportOrder.js';
import { findRemoteReference, importDateWindows, normalizeImportRows } from './liveShiprocketImport.js';
import { returnApi } from '../shiprocket/returnShipment.js';

export const fetchImportedShiprocketDetails = async ({ candidate, rows, adminId }) => {
  const match = await resolveImportOrder(candidate.reference);
  if (!match || String(match.order._id) !== String(candidate.orderId)) throw Error('Order reference no longer matches the imported order.');
  const order = match.order;
  const pkg = match.packageId ? await Package.findOne({ _id: match.packageId, order_id: order._id }) : null;
  if (match.packageId && !pkg) throw Error('Package no longer exists.');
  if (!pkg && await Package.exists({ order_id: order._id })) throw Error('This order has packages. Fetch details using its exact package reference.');
  const row = normalizeImportRows(rows).find(row => String(row['Order ID']).trim() === candidate.reference);
  const channel = String(row?.Channel || '').trim().toUpperCase();
  const existingId = pkg?.shiprocket_order_id || order.shiprocket_order_id;
  let remoteId = existingId;
  if (!remoteId) {
    // The export creation date scopes historical lookups, including non-delivered rows.
    const window = row ? importDateWindows([{ ...row, Status: 'DELIVERED' }])[0] : {};
    const matches = (await findRemoteReference(candidate.reference, window)).filter(remote => !channel || String(remote.channel_name || '').trim().toUpperCase() === channel);
    const unique = [...new Map(matches.map(remote => [String(remote.id), remote])).values()];
    if (unique.length !== 1) throw Error(unique.length ? 'Multiple Shiprocket orders match this reference and channel.' : 'No Shiprocket order matches this reference and channel.');
    remoteId = unique[0].id;
  }
  const remote = (await returnApi('GET', `orders/show/${encodeURIComponent(remoteId)}`)).data;
  if (!remote?.id || String(remote.id) !== String(remoteId)) throw Error('Shiprocket returned a different order ID.');
  const reference = String(remote.channel_order_id || '').trim();
  const allowedReferences = [candidate.reference, String(order.id), pkg?.reference_id].filter(Boolean);
  if (!(existingId && String(existingId) === candidate.reference) && !allowedReferences.includes(reference)) throw Error('Shiprocket channel order ID does not match this order.');
  if (channel && String(remote.channel_name || '').trim().toUpperCase() !== channel) throw Error('Shiprocket channel does not match the uploaded file.');
  const shipments = Array.isArray(remote.shipments) ? remote.shipments : remote.shipments ? [remote.shipments] : [];
  const selected = pkg?.shiprocket_shipment_id ? shipments.filter(shipment => String(shipment.id) === pkg.shiprocket_shipment_id) : shipments;
  if (selected.length !== 1 || !selected[0].id) throw Error('A unique shipment could not be identified. Review this order individually.');
  const shipment = selected[0];
  const metadata = { shiprocket_order_id: String(remote.id), shiprocket_shipment_id: String(shipment.id) };
  if (shipment.awb) metadata.awb = String(shipment.awb);
  if (shipment.courier_name) metadata.courier_name = String(shipment.courier_name);
  if (shipment.etd) metadata.etd = String(shipment.etd);
  const keys = [{ shiprocket_order_id: metadata.shiprocket_order_id }, { shiprocket_shipment_id: metadata.shiprocket_shipment_id }, ...(metadata.awb ? [{ awb: metadata.awb }] : [])];
  if (await Package.exists({ ...(pkg ? { _id: { $ne: pkg._id } } : {}), $or: keys }) || await Order.exists({ _id: { $ne: order._id }, deleted_at: null, $or: keys })) throw Error('These Shiprocket details are already linked to another order or package.');
  const now = new Date();
  const target = pkg || order;
  const filter = { _id: target._id, shiprocket_order_id: target.shiprocket_order_id ?? null };
  const update = { $set: metadata };
  if (pkg) {
    update.$push = { timeline: { status: pkg.status, occurred_at: now, raw: { source: 'admin_import_details_sync', changed_by: String(adminId), reference: candidate.reference, ...metadata } } };
  } else {
    filter.deleted_at = null;
    filter.order_status = order.order_status;
    update.$push = { manual_status_history: { from: order.order_status, to: order.order_status, changed_by: adminId, changed_at: now, reason: `Fetched Shiprocket details after forced import (reference: ${candidate.reference}; Shiprocket ID: ${metadata.shiprocket_order_id}; AWB: ${metadata.awb || 'unassigned'})` } };
  }
  const result = await (pkg ? Package : Order).updateOne(filter, update, { runValidators: true });
  if (result.matchedCount !== 1) throw Error('Order or shipment link changed during sync. Try again.');
  return metadata;
};
