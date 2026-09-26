import mongoose from 'mongoose';
import Order from '../../../../models/Order.js';
import Address from '../../../../models/Address.js';
import Invoice from '../../../../models/Invoice.js';
import OrderItem from '../../../../models/OrderItem.js';
import AuditLog from '../../../../models/AuditLog.js';
import { StatusError } from '../../../../config/index.js';
import { resolveAddressFields } from '../../customerAccount/address.js';
import { snapshotAddress } from '../../../../services/invoiceService/snapshotAddress.js';
import { getCompanySettings } from '../../../../services/invoiceService/getCompanySettings.js';

export const assertOrderAddressEditable = order => {
  if (!['pending', 'confirmed', 'processing'].includes(order.order_status) ||
      order.inventory_reverted || (order.refund?.status && order.refund.status !== 'not_required')) {
    throw StatusError.conflict('Addresses can only be corrected before the order is packed without refund or cancellation effects');
  }
  if (order.awb || order.shiprocket_order_id) {
    throw StatusError.conflict('This order has a legacy shipment. Order addresses are locked.');
  }
};

// An invoice can be revised in place until it is copied to Zoho Books; after
// that the accounting copy would silently disagree with ours.
export const assertInvoiceRevisable = invoice => {
  if (invoice && (invoice.zoho?.invoice_id || ['syncing', 'synced'].includes(invoice.zoho?.sync_status))) {
    throw StatusError.conflict('This invoice has been synced to Zoho Books. Order addresses are locked.');
  }
};

const sameState = (a, b) => {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  return !!x && x === y;
};

// Moving the delivery address across a state border changes the place of
// supply: the same tax is re-split between CGST+SGST (intra-state) and IGST.
// Amounts and rates are kept exactly as charged at checkout.
export const splitTax = (line, intraState) => {
  const tax = Number(line.tax_amount) || 0;
  if (!intraState) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Number((tax / 2).toFixed(2));
  return { cgst, sgst: Number((tax - cgst).toFixed(2)), igst: 0 };
};

export const updateAddress = async (req, res, next) => {
  let session;
  let revisedInvoice = null;
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
      const invoice = await Invoice.findOne({ order_id: order._id }).session(session);
      assertInvoiceRevisable(invoice);
      if (order.invoice?.generated && !invoice) {
        throw StatusError.conflict('The invoice is being generated. Try again in a moment.');
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
      }, { $set: { [ref]: updated._id, [`${ref}_snapshot`]: after, updated_at: now } }, { session });
      if (changed.modifiedCount !== 1) throw StatusError.conflict('Order changed. Refresh and try again.');

      // Re-split stored line taxes when the place of supply changes. The
      // invoice keeps the company details it was issued with.
      let taxResplit = false;
      if (address_kind === 'shipping' && !sameState(before?.state, after?.state)) {
        const companyState = invoice?.company?.state ?? (await getCompanySettings()).state;
        const intra = sameState(companyState, after?.state);
        if (intra !== sameState(companyState, before?.state)) {
          taxResplit = true;
          const items = await OrderItem.find({ order_id: order._id, tax_amount: { $gt: 0 } }).session(session).lean();
          if (items.length) {
            await OrderItem.bulkWrite(items.map(item => ({
              updateOne: { filter: { _id: item._id }, update: { $set: splitTax(item, intra) } },
            })), { session });
          }
          if (invoice) invoice.items.forEach(item => Object.assign(item, splitTax(item, intra)));
        }
      }

      // Revise the invoice in place: same number and date, new address, and
      // a revision entry. Invoice PDFs render from this document.
      if (invoice) {
        invoice[ref] = after;
        invoice.revision = (invoice.revision || 0) + 1;
        invoice.revisions.push({ revised_at: now, revised_by: req.auth.user_id, address_kind, reason, before, after });
        await invoice.save({ session });
        revisedInvoice = invoice.invoice_number;
      }
      await AuditLog.create([{
        user_id: order.user || original.user || req.auth.user_id, actor_id: req.auth.user_id,
        event: 'ORDER_ADDRESS_UPDATED', reason, ip: req.ip, user_agent: req.get('user-agent'),
        metadata: { order_id: order._id, order_number: order.id, address_kind,
          previous_address_id: original._id, address_id: updated._id, before, after,
          charges_confirmed, shipping: order.shipping, grand_total: order.grand_total, currency: order.currency,
          invoice_number: invoice?.invoice_number ?? null, invoice_revision: invoice?.revision ?? null, tax_resplit: taxResplit },
      }], { session });
    });
    res.json({ status: 'success', message: `${req.body.address_kind === 'shipping' ? 'Shipping' : 'Billing'} address updated${revisedInvoice ? ` and invoice ${revisedInvoice} revised` : ''}` });
  } catch (error) { next(error); }
  finally { if (session) await session.endSession(); }
};
