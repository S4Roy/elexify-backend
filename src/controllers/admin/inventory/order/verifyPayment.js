import crypto from "crypto";
import { StatusError } from "../../../../config/index.js";
import { orderService, notificationService, auditService } from "../../../../services/index.js";
import { getRazorpayClient, getRazorpayConfig } from "../../../../services/integrationCredentials/razorpay.js";
import { buildOrderContext, paymentContext } from "../../../../services/audit/paymentFailureContext.js";

export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, order_id } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !order_id) {
      throw StatusError.badRequest("Missing Razorpay verification fields");
    }
    const credentials = await getRazorpayConfig();
    const expected = crypto.createHmac("sha256", credentials.key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) {
      const context = await buildOrderContext(order_id);
      await auditService.recordAudit({ userId: context.userId, actorId: req.auth.user_id, event: "PAYMENT_VERIFICATION_FAILED", req,
        metadata: { order_id, reason: "signature_mismatch",
          claimed_razorpay_order_id: razorpay_order_id, claimed_razorpay_payment_id: razorpay_payment_id,
          source: "admin_verification", ...context.metadata } });
      throw StatusError.badRequest("Payment signature mismatch");
    }
    const payment = await (await getRazorpayClient()).payments.fetch(razorpay_payment_id);
    if (payment?.order_id !== razorpay_order_id) {
      const context = await buildOrderContext(order_id);
      await auditService.recordAudit({ userId: context.userId, actorId: req.auth.user_id, event: "PAYMENT_VERIFICATION_FAILED", req,
        metadata: { order_id, reason: "order_mismatch", razorpay_order_id, razorpay_payment_id,
          source: "admin_verification", ...paymentContext(payment), ...context.metadata } });
      throw StatusError.badRequest("Payment does not match Razorpay order");
    }
    const result = await orderService.finalizeCapturedPayment({
      orderId: order_id, paymentData: payment, source: "admin_verification",
    });
    if (!result.alreadyFinalized) {
      notificationService
        .sendOrderNotification({
          order: result.order,
          event: "PAYMENT_SUCCESS",
          dedupeKey: `${result.order.id}:PAYMENT_SUCCESS`,
        });
    }
    return res.status(200).json({
      status: "success",
      message: result.alreadyFinalized ? "Payment already verified" : "Payment verified and order finalized",
      payment_id: payment.id,
    });
  } catch (error) {
    next(error);
  }
};
