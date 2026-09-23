import Counter from "../../models/Counter.js";
import Address from "../../models/Address.js";
import { snapshotAddress } from "../invoiceService/snapshotAddress.js";
import { returnEligibility, paise, quantityAmount, requestAmount, canAdvancePickup, pickupLabels } from "../returnService/rules.js";
import { processReturnRefund } from "../returnService/refund.js";
import { createReplacement } from "../returnService/replacement.js";
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


const activeStatuses = ["requested"];
const event = (name, label, { status = null, actorType = "system", actorId = null, note = null, at = new Date() } = {}) => ({
  event: name, label, status, actor_type: actorType, actor_id: actorId, note, occurred_at: at,
});

export const createReturnRequest = async ({ orderId, customerId, items, reason, comment, evidence = [], return_type = 'refund', submission_key }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw StatusError.notFound('Order not found');
  if (!['refund', 'replacement'].includes(return_type)) throw StatusError.badRequest('Invalid return type');
  if (!Array.isArray(items) || !items.length || items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) throw StatusError.badRequest('Select valid quantities');
  if (reason?.toLowerCase() === 'other' && !comment?.trim()) throw StatusError.badRequest('Please describe the reason for your return');
  const ids = items.map((i) => String(i.order_item_id));
  if (new Set(ids).size !== ids.length) throw StatusError.badRequest('Each item may appear only once');
  const policy = await getOrderPolicy();
  if (!policy.return_reasons.includes(reason)) throw StatusError.badRequest('Select an allowed return reason');
  if (policy.return_require_images && !evidence.length) throw StatusError.badRequest('Supporting images are required');
  let result;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Serialize all requests for this order so concurrent requests cannot
      // both consume the same remaining quantity or refundable balance.
      const order = await Order.findOneAndUpdate({ _id: orderId, user: customerId, deleted_at: null }, { $set: { updated_at: new Date() } }, { new: true, session });
      if (!order) throw StatusError.notFound('Order not found');
      const existing = await ReturnRequest.find({ order_id: order._id }).session(session);
      const repeated = submission_key && existing.find((r) => r.submission_key === submission_key);
      if (repeated) { result = repeated; return; }
      const orderItems = await OrderItem.find({ order_id: order._id }).session(session);
      const eligibility = returnEligibility(order, policy, orderItems, existing);
      if (!eligibility.allowed) throw StatusError.badRequest('No items are eligible for return within the delivery return window');
      const snapshots = items.map((requested) => {
        const item = orderItems.find((i) => String(i._id) === String(requested.order_item_id));
        const available = eligibility.eligible_quantities[String(requested.order_item_id)] || 0;
        if (!item || requested.quantity > available) throw StatusError.badRequest('Return quantity exceeds remaining eligible quantity');
        const coupon = item.final_line_total > 0 ? paise(item.coupon_discount) : Math.round(paise(order.discount) * Number(item.total_price) / (Number(order.total_amount) || 1));
        const linePaise = Math.max(0, paise(item.total_price) - coupon);
        const reserved = existing.filter((r) => !['rejected', 'cancelled'].includes(r.status)).flatMap((r) => r.items)
          .filter((i) => String(i.order_item_id) === String(item._id))
          .reduce((sum, i) => sum + (i.refundable_request_paise ?? paise(i.refundable_unit_amount * i.quantity)), 0);
        return { refundable_request_paise: requestAmount(linePaise, item.quantity, requested.quantity, available, reserved), order_item_id: item._id, product_id: item.product_id, variation_id: item.variation_id,
          product_name: item.product_name || 'Product', sku: item.sku, quantity: requested.quantity, unit_price: item.unit_price,
          purchased_quantity: item.quantity, quantity_offset: item.quantity - available, refundable_line_paise: linePaise,
          refundable_unit_amount: linePaise / 100 / item.quantity };
      });
      if (evidence.length) {
        const count = await Media.countDocuments({ _id: { $in: evidence }, created_by: customerId, type: 'image', deleted_at: null }).session(session);
        if (count !== evidence.length) throw StatusError.badRequest('Invalid evidence images');
      }
      const year = new Date().getFullYear();
      const counter = await Counter.findOneAndUpdate({ _id: `return_${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
      const address = order.shipping_address_snapshot || await snapshotAddress(await Address.findById(order.shipping_address).session(session));
      const autoApprove = Boolean(policy.return_auto_approve);
      [result] = await ReturnRequest.create([{
        request_number: `RET-${year}-${String(counter.seq).padStart(4, '0')}`,
        order_id: order._id, order_number: order.id, customer_id: customerId, items: snapshots,
        return_type, submission_key, pickup_address_snapshot: address, reason, comment, evidence,
        status: autoApprove ? 'approved' : 'requested',
        ...(autoApprove && { reviewed_at: new Date(), review_note: 'Automatically approved by policy.' }),
        timeline: [event('return_requested', 'Requested', { status: 'requested', actorType: 'customer', actorId: customerId }),
          ...(autoApprove ? [event('return_approved', 'Approved', { status: 'approved' })] : [])],
        policy_snapshot: { window_days: policy.return_window_days, require_images: policy.return_require_images, auto_approve: autoApprove },
      }], { session });
      if (evidence.length) await Media.updateMany({ _id: { $in: evidence }, created_by: customerId, reference_id: null }, { $set: { reference_id: result._id, reference_type: 'return_requests' } }, { session });
      // Return state belongs to ReturnRequest; keep the delivered order intact.
    });
    return result;
  } finally { await session.endSession(); }
};

export const reviewReturnRequest = async ({ requestId, adminId, action, note }) => {
  if (!['approve', 'reject'].includes(action)) throw StatusError.badRequest('Invalid review action');
  if (action === 'reject' && !note?.trim()) throw StatusError.badRequest('A rejection remark is required');
  const targetStatus = action === "approve" ? "approved" : "rejected";
  const now = new Date();
  const request = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: activeStatuses } },
    {
      $set: { status: targetStatus, reviewed_at: now, reviewed_by: adminId, review_note: note || null },
      $push: { timeline: event(`return_${targetStatus}`, targetStatus === "approved" ? "Return Approved" : "Return Rejected", { status: targetStatus, actorType: "admin", actorId: adminId, note, at: now }) },
    },
    { new: true },
  );
  if (!request) throw StatusError.conflict("This return request has already been reviewed or does not exist.");
  if (targetStatus === "rejected") {
    await Order.updateOne({ _id: request.order_id, order_status: ORDER_STATUS.RETURN_REQUESTED }, { $set: { order_status: ORDER_STATUS.DELIVERED } });
  }
  return request;
};

export const receiveReturnRequest = async ({ requestId, adminId }) => {
  const now = new Date();
  const request = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: "approved" },
    {
      $set: { status: "received", received_at: now, received_by: adminId, "pickup.status": "delivered", "pickup.updated_at": now },
      $push: { timeline: event("return_received", "Return Received at Warehouse", { status: "received", actorType: "admin", actorId: adminId, at: now }) },
    },
    { new: true },
  );
  if (!request) throw StatusError.conflict("Only an approved return can be marked as received.");
  return request;
};

const restockAcceptedItems = async (request, adminId, session) => {
  for (const item of request.items) {
    if (item.disposition !== 'restock' || !item.accepted_quantity) continue;
    const Model = item.variation_id ? ProductVariation : Product;
    const updated = await Model.updateOne({ _id: item.variation_id || item.product_id }, { $inc: { stock_quantity: item.accepted_quantity } }, { session });
    if (updated.modifiedCount !== 1) throw StatusError.conflict('Return product no longer exists');
    await StockTransaction.create([{ reference_id: request._id, reference_type: 'return', product: item.product_id,
      variation: item.variation_id || null, type: 'return', quantity: item.accepted_quantity,
      selling_price: item.refundable_unit_amount, created_by: adminId }], { session });
  }
};

export const inspectReturnRequest = async ({ requestId, adminId, items, note }) => {
  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      request = await ReturnRequest.findOneAndUpdate({ _id: requestId, status: 'received', inventory_processed_at: null }, { $set: { status: 'processing' } }, { new: true, session });
      if (!request) throw StatusError.conflict('Return is not ready for QC or was already inspected');
      const order = await Order.findOneAndUpdate({ _id: request.order_id }, { $set: { updated_at: new Date() } }, { new: true, session });
      const decisions = new Map(items.map((i) => [String(i.return_item_id), i]));
      if (decisions.size !== items.length || items.length !== request.items.length) throw StatusError.badRequest('Inspect every item exactly once');
      let refundPaise = 0;
      for (const item of request.items) {
        const decision = decisions.get(String(item._id));
        if (!decision || !Number.isInteger(decision.accepted_quantity) || decision.accepted_quantity < 0 || decision.accepted_quantity > item.quantity || !['restock', 'damaged'].includes(decision.disposition)) throw StatusError.badRequest('Invalid QC quantities or disposition');
        item.accepted_quantity = decision.accepted_quantity;
        item.disposition = decision.accepted_quantity ? decision.disposition : 'reject';
        item.inspection_note = decision.note || null;
        refundPaise += item.refundable_request_paise != null
          ? Math.floor(item.refundable_request_paise * item.accepted_quantity / item.quantity)
          : item.refundable_line_paise != null && item.purchased_quantity
          ? quantityAmount(item.refundable_line_paise, item.purchased_quantity, item.quantity_offset, item.accepted_quantity)
          : paise(item.refundable_unit_amount * item.accepted_quantity);
      }
      const accepted = request.items.reduce((sum, i) => sum + i.accepted_quantity, 0);
      const requested = request.items.reduce((sum, i) => sum + i.quantity, 0);
      request.qc_status = !accepted ? 'failed' : accepted === requested ? 'passed' : 'partial';
      request.inspected_at = new Date(); request.inspected_by = adminId;
      request.timeline.push(event('return_inspected', !accepted ? 'Quality Check Failed' : 'Quality Check Passed', { actorType: 'admin', actorId: adminId, note }));
      await restockAcceptedItems(request, adminId, session);
      request.inventory_processed_at = new Date();
      if (!accepted) { request.status = 'qc_failed'; request.refund.status = 'not_required'; }
      else if (request.return_type === 'replacement') { request.status = 'replacement_pending'; request.refund.status = 'not_required'; }
      else {
        const reserved = await ReturnRequest.find({ order_id: order._id, _id: { $ne: request._id }, 'refund.status': { $in: ['pending', 'processed', 'manual_required', 'failed'] } }).session(session);
        const used = reserved.reduce((sum, r) => sum + paise(r.refund.amount), 0) + (order.refund?.status === 'processed' ? paise(order.refund.amount) : 0);
        if (refundPaise + used > paise(order.grand_total)) throw StatusError.conflict('Refund exceeds remaining paid amount');
        request.refund.amount = refundPaise / 100;
        request.refund.idempotency_key = `${request.request_number}-refund`;
        const online = order.payment_meta?.payment_provider !== 'manual' && order.payment_method === 'razorpay' && ['paid', 'partially_refunded', 'refund_pending'].includes(order.payment_status);
        request.status = !refundPaise ? 'completed' : online ? 'refund_pending' : 'manual_action_required';
        request.refund.status = !refundPaise ? 'not_required' : online ? 'pending' : 'manual_required';
        request.refund.provider = order.payment_method;
        request.timeline.push(event('refund_processing', !refundPaise ? 'Completed' : 'Refund Processing', { status: request.status }));
      }
      await request.save({ session });
    });
  } finally { await session.endSession(); }
  if (request.status === 'refund_pending') return processReturnRefund(request._id);
  // Replacement stock may be unavailable; preserve committed QC/restocking
  // and leave a contextual retry action rather than repeating the inspection.
  if (request.status === 'replacement_pending') {
    try { return await createReplacement(request._id, adminId); } catch (error) {
      await ReturnRequest.updateOne({ _id: request._id }, { $push: { timeline: event('replacement_waiting', 'Replacement Awaiting Stock', { note: 'An administrator will arrange your replacement.' }) } });
    }
  }
  return request;
};

export const completeManualReturnRefund = async ({ requestId, adminId, reference, note }) => {
  if (!reference?.trim()) throw StatusError.badRequest('Settlement reference is required');
  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      request = await ReturnRequest.findOneAndUpdate({ _id: requestId, status: 'manual_action_required', 'refund.status': 'manual_required' },
        { $set: { status: 'completed', 'refund.status': 'processed', 'refund.provider_ref': reference, 'refund.processed_at': new Date() },
          $push: { timeline: event('refund_completed', 'Refund Completed', { status: 'completed', actorType: 'admin', actorId: adminId, note }) } }, { new: true, session });
      if (!request) throw StatusError.conflict('Return is not awaiting manual settlement');
      const order = await Order.findOneAndUpdate({ _id: request.order_id }, { $set: { updated_at: new Date() } }, { new: true, session });
      const completed = await ReturnRequest.find({ order_id: order._id, 'refund.status': 'processed' }).session(session);
      const total = completed.reduce((sum, r) => sum + paise(r.refund.amount), 0);
      if (total > paise(order.grand_total)) throw StatusError.conflict('Refund exceeds order total');
      await Order.updateOne({ _id: order._id }, { $set: { payment_status: total >= paise(order.grand_total) ? 'refunded' : 'partially_refunded' } }, { session });
    });
    return request;
  } finally { await session.endSession(); }
};

export const updateReturnPickup = async ({ requestId, adminId, status, provider, trackingNumber, failureReason, expectedAt }) => {
  const request = await ReturnRequest.findOne({ _id: requestId, status: 'approved' });
  if (!request) throw StatusError.conflict('Pickup can only be updated before receipt');
  if (!canAdvancePickup(request.pickup.status, status)) throw StatusError.conflict('Pickup status cannot move backwards or repeat');
  if (['scheduled', 'rescheduled'].includes(status) && (!provider || !trackingNumber)) throw StatusError.badRequest('Courier and AWB are required');
  if (status === 'failed' && !failureReason?.trim()) throw StatusError.badRequest('A failure reason is required');
  const now = new Date();
  const set = { 'pickup.status': status, 'pickup.updated_at': now, 'pickup.provider_event_at': now,
    'pickup.failure_reason': status === 'failed' ? failureReason : null };
  if (provider) set['pickup.provider'] = provider;
  if (trackingNumber) set['pickup.tracking_number'] = trackingNumber;
  if (expectedAt !== undefined) set['pickup.expected_at'] = expectedAt;
  if (status === 'scheduled') set['pickup.scheduled_at'] = now;
  if (status === 'rescheduled') set['pickup.rescheduled_at'] = now;
  if (status === 'delivered') { set.status = 'received'; set.received_at = now; set.received_by = adminId; }
  const updated = await ReturnRequest.findOneAndUpdate({ _id: requestId, status: 'approved', 'pickup.status': request.pickup.status },
    { $set: set, ...(status === 'rescheduled' && { $inc: { 'pickup.reschedule_count': 1 } }),
      $push: { timeline: event(`pickup_${status}`, pickupLabels[status], { status, actorType: 'admin', actorId: adminId, note: failureReason }) } }, { new: true });
  if (!updated) throw StatusError.conflict('Pickup changed; refresh before updating');
  return updated;
};
