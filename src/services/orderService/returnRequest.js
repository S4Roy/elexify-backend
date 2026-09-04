import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import ReturnRequest from "../../models/ReturnRequest.js";
import Media from "../../models/Media.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockTransaction from "../../models/StockTransaction.js";
import { StatusError } from "../../config/index.js";
import { ORDER_STATUS } from "../../constants/orderStatus.js";
import { getOrderPolicy } from "./orderPolicy.js";

import { fetchRazorpayPayment, refundRazorpayPayment } from "../paymentService/refundRazorpayPayment.js";

const activeStatuses = ["requested"];

export const createReturnRequest = async ({ orderId, customerId, items, reason, comment, evidence = [] }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw StatusError.notFound("Order not found");
  const [order, policy] = await Promise.all([
    Order.findOne({ _id: orderId, user: customerId, deleted_at: null }),
    getOrderPolicy(),
  ]);
  if (!order) throw StatusError.notFound("Order not found");
  if (!policy.returns_enabled) throw StatusError.badRequest("Returns are currently disabled.");
  if (order.order_status !== ORDER_STATUS.DELIVERED || !order.delivered_at) {
    throw StatusError.badRequest("A return can only be requested after delivery.");
  }
  const deadline = new Date(order.delivered_at).getTime() + policy.return_window_days * 86400000;
  if (Date.now() > deadline) throw StatusError.badRequest("The return window for this order has expired.");
  if (!policy.return_reasons.includes(reason)) throw StatusError.badRequest("Select an allowed return reason.");
  if (policy.return_require_images && evidence.length === 0) {
    throw StatusError.badRequest("Supporting images are required for this return.");
  }

  const ids = items.map((item) => String(item.order_item_id));
  if (new Set(ids).size !== ids.length) throw StatusError.badRequest("Each order item may only appear once.");
  const orderItems = await OrderItem.find({ _id: { $in: ids }, order_id: order._id });
  if (orderItems.length !== items.length) throw StatusError.badRequest("One or more return items are invalid.");
  const itemById = new Map(orderItems.map((item) => [String(item._id), item]));
  const snapshots = items.map((requested) => {
    const item = itemById.get(String(requested.order_item_id));
    if (requested.quantity > item.quantity) throw StatusError.badRequest("Return quantity exceeds ordered quantity.");
    return {
      order_item_id: item._id, product_id: item.product_id, variation_id: item.variation_id,
      product_name: item.product_name || "Product", sku: item.sku,
      quantity: requested.quantity, unit_price: item.unit_price,
      refundable_unit_amount: Number(((item.final_line_total || item.total_price) / item.quantity).toFixed(2)),
    };
  });

  if (evidence.length) {
    const validEvidence = await Media.countDocuments({ _id: { $in: evidence }, created_by: customerId, type: "image", deleted_at: null });
    if (validEvidence !== evidence.length) throw StatusError.badRequest("One or more evidence images are invalid.");
  }

  const autoApprove = Boolean(policy.return_auto_approve);
  try {
    const request = await ReturnRequest.create({
      request_number: `RET-${Date.now()}-${String(order._id).slice(-6).toUpperCase()}`,
      order_id: order._id, customer_id: customerId, items: snapshots, reason, comment, evidence,
      status: autoApprove ? "approved" : "requested",
      ...(autoApprove && { reviewed_at: new Date(), review_note: "Automatically approved by policy." }),
      policy_snapshot: { window_days: policy.return_window_days, require_images: policy.return_require_images, auto_approve: autoApprove },
    });
    if (evidence.length) {
      await Media.updateMany(
        { _id: { $in: evidence }, created_by: customerId, reference_id: null },
        { $set: { reference_id: request._id, reference_type: "return_requests" } },
      );
    }
    await Order.updateOne({ _id: order._id, order_status: ORDER_STATUS.DELIVERED }, { $set: { order_status: ORDER_STATUS.RETURN_REQUESTED } });
    return request;
  } catch (error) {
    if (error?.code === 11000) throw StatusError.conflict("A return request already exists for this order.");
    throw error;
  }
};

export const reviewReturnRequest = async ({ requestId, adminId, action, note }) => {
  const targetStatus = action === "approve" ? "approved" : "rejected";
  const request = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: activeStatuses } },
    { $set: { status: targetStatus, reviewed_at: new Date(), reviewed_by: adminId, review_note: note || null } },
    { new: true },
  );
  if (!request) throw StatusError.conflict("This return request has already been reviewed or does not exist.");
  if (targetStatus === "rejected") {
    await Order.updateOne({ _id: request.order_id, order_status: ORDER_STATUS.RETURN_REQUESTED }, { $set: { order_status: ORDER_STATUS.DELIVERED } });
  }
  return request;
};

export const receiveReturnRequest = async ({ requestId, adminId }) => {
  const request = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: "approved" },
    { $set: { status: "received", received_at: new Date(), received_by: adminId } },
    { new: true },
  );
  if (!request) throw StatusError.conflict("Only an approved return can be marked as received.");
  return request;
};

const restockAcceptedItems = async (request, adminId) => {
  for (const item of request.items) {
    if (item.disposition !== "restock" || !item.accepted_quantity) continue;
    const transaction = await StockTransaction.findOneAndUpdate(
      { reference_id: request._id, reference_type: "return", product: item.product_id, variation: item.variation_id || null, type: "return" },
      { $setOnInsert: { quantity: item.accepted_quantity, selling_price: item.refundable_unit_amount, created_by: adminId } },
      { upsert: true, new: true, rawResult: true },
    );
    if (transaction?.lastErrorObject?.updatedExisting) continue;
    const Model = item.variation_id ? ProductVariation : Product;
    await Model.updateOne({ _id: item.variation_id || item.product_id }, { $inc: { stock_quantity: item.accepted_quantity } });
  }
};

export const inspectReturnRequest = async ({ requestId, adminId, items, note }) => {
  const claimed = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: "received", inventory_processed_at: null },
    { $set: { status: "processing" } },
    { new: true },
  );
  if (!claimed) throw StatusError.conflict("This return is not ready for inspection or was already processed.");
  try {
    const decisions = new Map(items.map((item) => [String(item.return_item_id), item]));
    for (const item of claimed.items) {
      const decision = decisions.get(String(item._id));
      if (!decision || decision.accepted_quantity > item.quantity) throw StatusError.badRequest("Every return item requires a valid inspection decision.");
      item.accepted_quantity = decision.accepted_quantity;
      item.disposition = decision.accepted_quantity === 0 ? "reject" : decision.disposition;
      item.inspection_note = decision.note || null;
    }
    claimed.inspected_at = new Date(); claimed.inspected_by = adminId; claimed.review_note = note || claimed.review_note;
    const refundAmount = Number(claimed.items.reduce((sum, item) => sum + item.accepted_quantity * item.refundable_unit_amount, 0).toFixed(2));
    claimed.refund.amount = refundAmount;
    claimed.refund.idempotency_key = `${claimed.request_number}-refund`;
    await restockAcceptedItems(claimed, adminId);
    claimed.inventory_processed_at = new Date();

    const order = await Order.findById(claimed.order_id);
    if (!refundAmount) {
      claimed.status = "completed"; claimed.refund.status = "not_required";
      await Order.updateOne({ _id: order._id }, { $set: { order_status: ORDER_STATUS.DELIVERED } });
    } else if (order.payment_method === "razorpay" && order.payment_status === "paid") {
      claimed.status = "refund_pending"; claimed.refund.status = "pending"; claimed.refund.provider = "razorpay";
      await claimed.save();
      const paymentId = order.payment_meta?.razorpay_payment_id;
      if (!paymentId) throw new Error("No Razorpay payment id is recorded for this order.");
      const payment = await fetchRazorpayPayment(paymentId);
      const remainingPaise = Number(payment.amount || 0) - Number(payment.amount_refunded || 0);
      const amountPaise = Math.round(refundAmount * 100);
      if (amountPaise > remainingPaise) throw new Error("Return refund exceeds the remaining captured payment amount.");
      const response = await refundRazorpayPayment(paymentId, amountPaise, claimed.refund.idempotency_key);
      claimed.refund.provider_ref = response.id; claimed.refund.status = response.status === "processed" ? "processed" : "pending";
      claimed.status = response.status === "processed" ? "completed" : "refund_pending";
      claimed.refund.processed_at = response.status === "processed" ? new Date() : null;
      const paymentStatus = response.status === "processed"
        ? (amountPaise === Number(payment.amount) ? "refunded" : "partially_refunded")
        : "refund_pending";
      await Order.updateOne({ _id: order._id }, { $set: { order_status: ORDER_STATUS.RETURNED, payment_status: paymentStatus } });
    } else {
      claimed.status = "manual_action_required"; claimed.refund.status = "manual_required"; claimed.refund.provider = order.payment_method;
      await Order.updateOne({ _id: order._id }, { $set: { order_status: ORDER_STATUS.RETURNED } });
    }
    await claimed.save();
    return claimed;
  } catch (error) {
    const inventoryMoved = Boolean(claimed.inventory_processed_at);
    await ReturnRequest.updateOne({ _id: claimed._id }, { $set: inventoryMoved
      ? { status: "refund_failed", "refund.status": "failed", "refund.failure_reason": error.message }
      : { status: "received" } });
    throw error;
  }
};

export const completeManualReturnRefund = async ({ requestId, adminId, reference, note }) => {
  const request = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: "manual_action_required", "refund.status": "manual_required" },
    { $set: {
      status: "completed", "refund.status": "processed", "refund.provider_ref": reference,
      "refund.processed_at": new Date(), reviewed_by: adminId,
      ...(note && { review_note: note }),
    } },
    { new: true },
  );
  if (!request) throw StatusError.conflict("This return is not awaiting manual settlement.");
  const order = await Order.findById(request.order_id);
  if (order?.payment_status === "paid") {
    const paymentStatus = request.refund.amount >= order.grand_total ? "refunded" : "partially_refunded";
    await Order.updateOne({ _id: order._id }, { $set: { payment_status: paymentStatus } });
  }
  return request;
};

export const updateReturnPickup = async ({ requestId, adminId, status, provider, trackingNumber, failureReason }) => {
  const request = await ReturnRequest.findOne({ _id: requestId, status: { $in: ["approved", "received"] } });
  if (!request) throw StatusError.conflict("Pickup can only be updated for an approved return.");
  if (status === "scheduled" && (!provider || !trackingNumber)) {
    throw StatusError.badRequest("Pickup provider and tracking number are required.");
  }
  request.pickup.status = status;
  if (provider !== undefined) request.pickup.provider = provider;
  if (trackingNumber !== undefined) request.pickup.tracking_number = trackingNumber;
  request.pickup.updated_at = new Date();
  request.pickup.failure_reason = status === "failed" ? failureReason : null;
  if (status === "scheduled" && !request.pickup.scheduled_at) request.pickup.scheduled_at = new Date();
  await request.save();
  if (status === "delivered" && request.status === "approved") {
    return receiveReturnRequest({ requestId: request._id, adminId });
  }
  return request;
};
