import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import { invoiceService } from "../../../../services/index.js";
import { StatusError } from "../../../../config/index.js";

export const invoice = async (req, res, next) => {
  try {
    const { order_id } = req.query;
    const user_id = req.auth?.user_id || null;

    if (!user_id) {
      throw StatusError.unauthorized(req.__("Unauthorized"));
    }
    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      throw StatusError.notFound("Order not found");
    }

    // Ownership-scoped lookup, same convention as cancelOrder.js: 404 (not
    // 403) on mismatch so an invoice can never be pulled by guessing an
    // order_id that belongs to someone else.
    const owned = await Order.exists({ _id: order_id, user: user_id, deleted_at: null });
    if (!owned) {
      throw StatusError.notFound("Order not found");
    }

    const doc = await invoiceService.getOrGenerateInvoice({ orderId: order_id, actorType: "customer" });
    const pdfBuffer = await invoiceService.renderInvoicePdf(doc);

    const filename = `Invoice-${doc.invoice_number.replace(/\//g, "-")}.pdf`;
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length,
    });
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
