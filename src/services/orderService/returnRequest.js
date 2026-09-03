import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import ReturnRequest from "../../models/ReturnRequest.js";
import Media from "../../models/Media.js";
import { StatusError } from "../../config/index.js";
import { ORDER_STATUS } from "../../constants/orderStatus.js";
import { getOrderPolicy } from "./orderPolicy.js";

const activeStatuses = ["requested", "approved"];

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
