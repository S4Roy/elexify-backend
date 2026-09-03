import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockTransaction from "../../models/StockTransaction.js";
import Coupon from "../../models/Coupon.js";
import CouponUsage from "../../models/CouponUsage.js";
import User from "../../models/User.js";
import { envs, StatusError } from "../../config/index.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { getRazorpayConfig } from "../integrationCredentials/razorpay.js";

const normalize = (value) => String(value || "").toUpperCase();

export const validateCapturedPayment = (order, payment, configuredAccount = envs.razorpay.account_id) => {
  const expectedAmount = Math.round(Number(order.grand_total) * 100);
  if (
    !payment?.id ||
    payment.order_id !== order.payment_meta?.razorpay_order_id ||
    payment.status !== "captured" ||
    Number(payment.amount) !== expectedAmount ||
    normalize(payment.currency) !== normalize(order.currency) ||
    (configuredAccount && payment.account_id !== configuredAccount)
  ) {
    throw StatusError.badRequest("Captured payment does not match this order");
  }
};

export const finalizeCapturedPayment = async ({
  orderId,
  paymentData,
  source,
  userId = null,
}) => {
  const lookup = {
    deleted_at: null,
    payment_method: "razorpay",
    $or: [{ id: orderId }, ...(mongoose.Types.ObjectId.isValid(orderId) ? [{ _id: orderId }] : [])],
  };
  if (userId) lookup.user = userId;

  const existing = await Order.findOne(lookup);
  if (!existing) throw StatusError.notFound("Order not found");
  const credentials = await getRazorpayConfig();
  validateCapturedPayment(existing, paymentData, credentials.account_id);

  if (existing.payment_status === PAYMENT_STATUS.PAID && existing.stock_reserved) {
    return { order: existing, alreadyFinalized: true };
  }

  const session = await mongoose.startSession();
  let finalized;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: existing._id,
        payment_status: { $ne: PAYMENT_STATUS.PAID },
        stock_reserved: { $ne: true },
      }).session(session);

      if (!order) {
        finalized = await Order.findById(existing._id).session(session);
        if (!finalized?.stock_reserved || finalized.payment_status !== PAYMENT_STATUS.PAID) {
          throw StatusError.conflict("Payment finalization is already in progress");
        }
        return;
      }

      const items = await OrderItem.find({ order_id: order._id }).session(session);
      if (!items.length) throw StatusError.conflict("Order has no purchasable items");

      for (const item of items) {
        const Model = item.variation_id ? ProductVariation : Product;
        const stockId = item.variation_id || item.product_id;
        const updated = await Model.updateOne(
          { _id: stockId, status: { $ne: "inactive" }, stock_quantity: { $gte: item.quantity } },
          { $inc: { stock_quantity: -item.quantity } },
          { session },
        );
        if ((updated.modifiedCount ?? updated.nModified) !== 1) {
          throw StatusError.conflict("OUT_OF_STOCK");
        }

        await StockTransaction.create([{
          product: item.product_id,
          variation: item.variation_id || null,
          type: "sale",
          quantity: item.quantity,
          reference_id: order._id,
          reference_type: "order",
          mrp: item.regular_price || 0,
          selling_price: item.unit_price || 0,
        }], { session });
      }

      if (order.coupon_code && Number(order.discount) > 0) {
        const [coupon, user] = await Promise.all([
          Coupon.findOne({ code: order.coupon_code }).session(session),
          User.findById(order.user).session(session),
        ]);
        if (coupon && user?.email) {
          const usage = await CouponUsage.updateOne(
            { order: order._id },
            { $setOnInsert: {
              coupon: coupon._id,
              user: order.user,
              email: user.email,
              discount_amount: order.discount,
              currency: order.currency,
            } },
            { upsert: true, session },
          );
          if (usage.upserted?.length || usage.upsertedId) {
            await Coupon.updateOne({ _id: coupon._id }, { $inc: { total_used: 1 } }, { session });
          }
        }
      }

      finalized = await Order.findOneAndUpdate(
        { _id: order._id, payment_status: { $ne: PAYMENT_STATUS.PAID } },
        { $set: {
          payment_status: PAYMENT_STATUS.PAID,
          order_status: ORDER_STATUS.PROCESSING,
          paid_at: new Date(),
          stock_reserved: true,
          payment_meta: {
            payment_provider: "razorpay",
            razorpay_order_id: paymentData.order_id,
            razorpay_payment_id: paymentData.id,
            method: paymentData.method || null,
            card: paymentData.card || null,
            vpa: paymentData.vpa || null,
            bank: paymentData.bank || null,
            wallet: paymentData.wallet || null,
            finalized_by: source,
          },
        } },
        { new: true, session },
      );
    });
  } finally {
    await session.endSession();
  }
  return { order: finalized, alreadyFinalized: false };
};
