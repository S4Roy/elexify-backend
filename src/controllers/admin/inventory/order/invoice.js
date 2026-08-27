import mongoose from "mongoose";
import { invoiceService } from "../../../../services/index.js";
import { StatusError } from "../../../../config/index.js";

export const invoice = async (req, res, next) => {
  try {
    const { order_id } = req.query;

    if (!order_id || !mongoose.Types.ObjectId.isValid(order_id)) {
      throw StatusError.notFound("Order not found");
    }

    const doc = await invoiceService.getOrGenerateInvoice({ orderId: order_id, actorType: "admin" });
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
