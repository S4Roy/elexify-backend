import mongoose from "mongoose";
import Invoice from "../../../../models/Invoice.js";
import Order from "../../../../models/Order.js";
import { StatusError } from "../../../../config/index.js";
import { zohoService, auditService } from "../../../../services/index.js";

const assertOrderId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) throw StatusError.notFound("Order not found");
};

const view = (invoice, order) => ({
  eligible: Boolean(order?.invoice?.generated) || ["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"].includes(order?.order_status),
  local: invoice ? {
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    grand_total: invoice.totals?.grand_total,
    currency: invoice.currency,
  } : null,
  zoho: invoice?.zoho || { sync_status: "not_synced", attempts: 0 },
});

export const zohoInvoiceStatus = async (req, res, next) => {
  try {
    const orderId = req.query.order_id;
    assertOrderId(orderId);
    const [order, invoice] = await Promise.all([
      Order.findOne({ _id: orderId, deleted_at: null }).select("order_status invoice").lean(),
      Invoice.findOne({ order_id: orderId }).lean(),
    ]);
    if (!order) throw StatusError.notFound("Order not found");
    res.status(200).json({ status: "success", data: view(invoice, order) });
  } catch (error) { next(error); }
};

export const syncZohoInvoice = async (req, res, next) => {
  const orderId = req.body?.order_id;
  try {
    assertOrderId(orderId);
    const invoice = await zohoService.syncOrderInvoiceToZoho({ orderId });
    const order = await Order.findById(orderId).select("order_status invoice").lean();
    await auditService.recordAudit({
      userId: req.auth.user_id, actorId: req.auth.user_id, req,
      event: "ZOHO_INVOICE_SYNCED",
      metadata: { order_id: orderId, local_invoice_number: invoice.invoice_number, zoho_invoice_id: invoice.zoho?.invoice_id },
    });
    res.status(200).json({ status: "success", message: "Invoice synchronized with Zoho Books.", data: view(invoice, order) });
  } catch (error) {
    if (req.auth?.user_id && mongoose.Types.ObjectId.isValid(orderId)) {
      await auditService.recordAudit({
        userId: req.auth.user_id, actorId: req.auth.user_id, req,
        event: "ZOHO_INVOICE_SYNC_FAILED",
        metadata: { order_id: orderId },
      });
    }
    next(error);
  }
};
