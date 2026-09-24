import crypto from "crypto";
import { StatusError } from "../../../../config/index.js";
import { orderService, notificationService, auditService } from "../../../../services/index.js";
import { getRazorpayClient, getRazorpayConfig } from "../../../../services/integrationCredentials/razorpay.js";

export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, order_id } = req.body;
    const userId = req.auth?.user_id;
    if (!userId) throw StatusError.unauthorized("Login required to verify payment");
    const credentials = await getRazorpayConfig();
    const expected = crypto.createHmac("sha256", credentials.key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) {
      // A mismatched signature means the payment_id/order_id/signature
      // triple wasn't actually issued by Razorpay for this request — either
      // corruption or a forged client attempt to fake a successful payment.
      await auditService.recordAudit({ userId, event: "PAYMENT_VERIFICATION_FAILED", req,
        metadata: { order_id, reason: "signature_mismatch", razorpay_order_id, razorpay_payment_id } });
      throw StatusError.badRequest("Payment signature mismatch");
    }

    const payment = await (await getRazorpayClient()).payments.fetch(razorpay_payment_id);
    if (payment?.order_id !== razorpay_order_id) {
      await auditService.recordAudit({ userId, event: "PAYMENT_VERIFICATION_FAILED", req,
        metadata: { order_id, reason: "order_mismatch", razorpay_order_id, razorpay_payment_id } });
      throw StatusError.badRequest("Payment does not match Razorpay order");
    }
    const result = await orderService.finalizeCapturedPayment({
      orderId: order_id, paymentData: payment, source: "browser", userId,
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
      data: { order: result.order },
    });
  } catch (error) {
    console.error("❌ verifyPayment error:", error?.message || error);
    next(error);
  }
};
