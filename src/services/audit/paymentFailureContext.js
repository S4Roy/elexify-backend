import Order from "../../models/Order.js";

// Enriches a PAYMENT_VERIFICATION_FAILED audit entry with order/payment
// context beyond the bare order_id, so reviewing the audit log doesn't
// require cross-referencing the order separately. Read-only, best-effort —
// a lookup failure here must never mask the actual verification failure
// being logged, so it swallows its own errors and returns an empty object.
export const buildOrderContext = async (orderId) => {
  try {
    const order = await Order.findOne({
      $or: [{ id: orderId }, ...(orderId?.length === 24 ? [{ _id: orderId }] : [])],
    }).select("user grand_total currency payment_method billing_address_snapshot").lean();
    if (!order) return { userId: null, metadata: {} };
    return {
      userId: order.user || null,
      metadata: {
        order_amount: order.grand_total,
        order_currency: order.currency,
        order_payment_method: order.payment_method,
        customer_email: order.billing_address_snapshot?.email || null,
        customer_phone: order.billing_address_snapshot?.phone || null,
      },
    };
  } catch {
    return { userId: null, metadata: {} };
  }
};

// Razorpay's own payment object, when one was actually fetched (the
// order_mismatch case — not available for signature_mismatch, which fails
// before any Razorpay call is made).
export const paymentContext = (payment) => payment ? {
  razorpay_payment_status: payment.status,
  razorpay_payment_amount: payment.amount != null ? payment.amount / 100 : null,
  razorpay_payment_currency: payment.currency,
  razorpay_payment_method: payment.method,
  razorpay_payment_email: payment.email,
  razorpay_payment_contact: payment.contact,
  razorpay_payment_belongs_to_order: payment.order_id,
} : {};
