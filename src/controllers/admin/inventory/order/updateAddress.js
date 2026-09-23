import mongoose from 'mongoose';
import Order from '../../../../models/Order.js';
import Address from '../../../../models/Address.js';
import Invoice from '../../../../models/Invoice.js';
import AuditLog from '../../../../models/AuditLog.js';
import { StatusError } from '../../../../config/index.js';
import { resolveAddressFields } from '../../customerAccount/address.js';
import { snapshotAddress } from '../../../../services/invoiceService/snapshotAddress.js';

export const assertOrderAddressEditable = order => {
  if (!['pending', 'confirmed', 'processing'].includes(order.order_status) ||
      order.inventory_reverted || (order.refund?.status && order.refund.status !== 'not_required')) {
    throw StatusError.conflict('Addresses can only be corrected before the order is packed without refund or cancellation effects');
  }
  if (order.invoice?.generated) throw StatusError.conflict('An invoice has been generated or is being generated. Order addresses are locked.');
  if (order.awb || order.shiprocket_order_id) {
    throw StatusError.conflict('This order has a legacy shipment. Order addresses are locked.');
  }
};

export const updateAddress = async (req, res, next) => {
  let session;
  try {
    const { order_id, address_kind, expected_address_id, expected_updated_at, reason, charges_confirmed, ...fields } = req.body;
    const resolved = await resolveAddressFields({ ...fields, purpose: address_kind });
    const ref = `${address_kind}_address`;
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: order_id, deleted_at: null }).session(session);
      if (!order) throw StatusError.notFound('Order not found');
      assertOrderAddressEditable(order);
      if (String(order[ref]) !== expected_address_id ||
          (order.updated_at?.getTime() || null) !== (expected_updated_at ? new Date(expected_updated_at).getTime() : null)) {
        throw StatusError.conflict('Order changed. Close the editor, refresh and review the latest details.');
      }
      if (await Invoice.exists({ order_id: order._id }).session(session)) {
        throw StatusError.conflict('This order already has invoice records. Its addresses are locked.');
      }
      const original = await Address.findById(order[ref]).session(session).lean();
      if (!original) throw StatusError.notFound('Original order address not found');
      const now = new Date();
      // An order-specific copy keeps the customer's address book and every
      // other order intact. Archived copies remain readable by order refs.
      const [updated] = await Address.create([{
        ...fields, ...resolved, user: original.user || order.user || req.auth.user_id,
        purpose: address_kind, address_type: address_kind,
        is_default: false, latitude: null, longitude: null,
        created_by: req.auth.user_id, updated_by: req.auth.user_id, updated_at: now,
        deleted_at: now,
      }], { session });
      const before = order[`${ref}_snapshot`] || await snapshotAddress(original);
      const after = await snapshotAddress(updated);
      const changed = await Order.updateOne({ _id: order._id, [ref]: order[ref],
        updated_at: order.updated_at || null, order_status: order.order_status,
        'invoice.generated': { $ne: true },
      }, { $set: { [ref]: updated._id, [`${ref}_snapshot`]: after, updated_at: now } }, { session });
      if (changed.modifiedCount !== 1) throw StatusError.conflict('Order changed. Refresh and try again.');
      await AuditLog.create([{
        user_id: order.user || original.user || req.auth.user_id, actor_id: req.auth.user_id,
        event: 'ORDER_ADDRESS_UPDATED', reason, ip: req.ip, user_agent: req.get('user-agent'),
        metadata: { order_id: order._id, order_number: order.id, address_kind,
          previous_address_id: original._id, address_id: updated._id, before, after,
          charges_confirmed, shipping: order.shipping, grand_total: order.grand_total, currency: order.currency },
      }], { session });
    });
    res.json({ status: 'success', message: `${req.body.address_kind === 'shipping' ? 'Shipping' : 'Billing'} address updated` });
  } catch (error) { next(error); }
  finally { if (session) await session.endSession(); }
};
