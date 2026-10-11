import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import User from "../../../models/User.js";
import Role from "../../../models/Role.js";
import { PERMISSIONS } from "../../../constants/adminPermissions.js";
import { StatusError } from "../../../config/index.js";
import { sendOrderNotification } from "../../notification/sendOrderNotification.js";
import { transitionOrder } from "../transitionOrder.js";
import { packageReference } from "./packageReference.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";
import { fulfillmentBlocked } from "./applyShiprocketShipment.js";
import { newDeliveryOtp, sendDeliveryOtp, verifyDeliveryOtp } from "./deliveryOtp.js";

// Fulfillment without a courier: our own rider hand-delivers
// ("self_delivery") or the customer collects from the store
// ("store_pickup"). Goes through the same Package → recomputeOrderStatus
// lifecycle as a Shiprocket shipment, so order status, return window
// (order.delivered_at), invoice and notifications behave identically —
// only the channel and the proof differ. Manual packages carry no
// Shiprocket ids/AWB, so the courier webhook can never match or move them.
export const MANUAL_FULFILLMENT_MODES = ["self_delivery", "store_pickup"];
export const COD_COLLECTION_METHODS = ["cash", "upi"];

const DISPATCH_BLOCKED_STATUSES = ["pending", "cancel_requested", "cancelled", "returned", "return_requested", "delivered", "failed"];

const pushHistory = (orderId, from, to, reason, adminId, session) => {
  if (from === to) return null;
  return Order.updateOne({ _id: orderId }, { $push: { manual_status_history: {
    from, to, reason, changed_by: adminId, changed_at: new Date(),
  } } }, { session });
};

// Amount still owed at the door: the whole order for full COD, the balance
// after the online advance for Partial COD, nothing for prepaid.
export const codAmountDue = (order) => {
  if (order.payment_method !== "cod" || order.payment_status === "paid") return 0;
  if (order.is_partial_cod) return order.payment_status === "advance_paid" ? Number(order.cod_due_amount) || 0 : 0;
  return order.payment_status === "pending" ? Number(order.grand_total) || 0 : 0;
};

const withTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
};

// A rider may back-date a handover only this far (admins are not limited).
const RIDER_BACKDATE_LIMIT_MS = 24 * 3600_000;

// Active staff account whose role grants delivery.run.
export const findDeliveryStaff = async (userId, session = null) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await User.findOne({ _id: userId, status: "active", deleted_at: null })
    .select("_id name first_name last_name mobile admin_role_id").session(session).lean();
  if (!user?.admin_role_id) return null;
  const role = await Role.findOne({ _id: user.admin_role_id, status: "active", deleted_at: null, permissions: PERMISSIONS.DELIVERY_RUN })
    .select("_id").session(session).lean();
  return role ? user : null;
};

export const staffName = (user) =>
  (user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(" ")).trim() || null;

const loadManualPackage = async (packageId, session, riderId = null) => {
  if (!mongoose.Types.ObjectId.isValid(packageId)) throw StatusError.notFound("Package not found");
  const pkg = await Package.findById(packageId).session(session);
  if (!pkg) throw StatusError.notFound("Package not found");
  if (!MANUAL_FULFILLMENT_MODES.includes(pkg.fulfillment_mode)) {
    throw StatusError.conflict("Courier packages are updated by Shiprocket tracking, not manually.");
  }
  // Riders act only on their own assignments; same 404 as a missing package
  // so ids of other riders' deliveries are not confirmed.
  if (riderId && String(pkg.delivery_agent?.user_id || "") !== String(riderId)) {
    throw StatusError.notFound("Package not found");
  }
  const order = await Order.findOne({ _id: pkg.order_id, deleted_at: null }).session(session);
  if (!order) throw StatusError.notFound("Order not found");
  if (fulfillmentBlocked(order)) {
    throw StatusError.conflict("This order has cancellation, return, or refund effects and cannot be updated manually");
  }
  return { pkg, order };
};

/**
 * Hands the whole order to a rider (self_delivery → out_for_delivery) or
 * marks it ready at the counter (store_pickup → packed).
 */
export const dispatchManual = async ({ orderId, mode, agent, reason, adminId, dispatchedAt = null }) => {
  if (!MANUAL_FULFILLMENT_MODES.includes(mode)) throw StatusError.badRequest("Unknown fulfillment mode");
  // Admins often record a run after the fact; default to now.
  const now = dispatchedAt ? new Date(dispatchedAt) : new Date();
  if (!Number.isFinite(now.getTime()) || now > new Date()) {
    throw StatusError.badRequest("Dispatch time must be a valid time, not in the future");
  }
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw StatusError.notFound("Order not found");

  // Generated once outside the transaction so a retried attempt stores the
  // same code that is texted afterwards.
  const packageId = new mongoose.Types.ObjectId();
  const otp = newDeliveryOtp(packageId);

  const { pkg, order, previousStatus } = await withTransaction(async (session) => {
    const order = await Order.findOne({ _id: orderId, deleted_at: null }).session(session);
    if (!order) throw StatusError.notFound("Order not found");
    if (DISPATCH_BLOCKED_STATUSES.includes(order.order_status)) {
      throw StatusError.conflict(`Cannot dispatch: order is "${order.order_status}".`);
    }
    if (fulfillmentBlocked(order)) {
      throw StatusError.conflict("This order has cancellation, return, or refund effects and cannot be dispatched");
    }
    if ((order.payment_method === "razorpay" || order.is_partial_cod) && !["paid", "advance_paid"].includes(order.payment_status)) {
      throw StatusError.conflict("Record the received payment before dispatching this order.");
    }
    if (order.created_at && now < new Date(order.created_at)) {
      throw StatusError.badRequest("Dispatch time cannot be before the order was placed");
    }

    const [orderItems, existingPackages] = await Promise.all([
      OrderItem.find({ order_id: order._id }).session(session),
      Package.find({ order_id: order._id }).session(session),
    ]);
    if (existingPackages.some((p) => p.status !== "cancelled")) {
      throw StatusError.conflict("This order already has packages. Cancel them first or use the package workflow.");
    }
    if (!orderItems.length) throw StatusError.badRequest("This order has no items to dispatch.");

    let staff = null;
    if (agent.user_id) {
      staff = await findDeliveryStaff(agent.user_id, session);
      if (!staff) throw StatusError.badRequest("Choose an active staff account with the Delivery Staff permission.");
    }
    const agentName = agent.name?.trim() || staffName(staff);
    if (!agentName) throw StatusError.badRequest("Enter who is delivering or handing over this order.");

    const packageNumber = existingPackages.reduce((max, p) => Math.max(max, p.package_number), 0) + 1;
    const status = mode === "self_delivery" ? "out_for_delivery" : "packed";
    const [pkg] = await Package.create([{
      _id: packageId,
      order_id: order._id,
      package_number: packageNumber,
      reference_id: packageReference(order.id, packageNumber),
      items: orderItems.map((oi) => ({ order_item_id: oi._id, quantity: oi.quantity })),
      status,
      fulfillment_mode: mode,
      integration_status: "not_applicable",
      delivery_agent: { name: agentName, phone: agent.phone?.trim() || staff?.mobile || null, user_id: staff?._id || null },
      shipped_at: status === "out_for_delivery" ? now : null,
      delivery_otp: otp.record,
      timeline: [{ status, occurred_at: now, raw: { source: "manual_fulfillment", mode, changed_by: String(adminId), reason: reason.trim() } }],
      created_by: adminId,
    }], { session });

    const { order: recomputed } = await recomputeOrderStatus({ orderId: order._id, session });
    await pushHistory(order._id, order.order_status, recomputed.order_status, reason.trim(), adminId, session);
    return { pkg, order: recomputed, previousStatus: order.order_status };
  });

  if (order.order_status !== previousStatus) {
    const event = mode === "self_delivery" ? "ORDER_OUT_FOR_DELIVERY" : "ORDER_READY_FOR_PICKUP";
    sendOrderNotification({ order, event, dedupeKey: `${order.id}:${event}` });
  }
  const otpSent = await sendDeliveryOtp({ order, mode, code: otp.code });
  return { pkg, order, otpSent };
};

/**
 * Records the handover with proof of delivery. `deliveredAt` is the real
 * handover time (it starts the return window). COD cash/UPI collected at
 * the door is recorded in the same transaction and settles the payment.
 */
export const markManualDelivered = async ({
  packageId, deliveredAt, receiverName, receiverRelation = null, photoUrl = null, photoKey = null, notes = null,
  codCollection = null, otp = null, adminId, riderId = null,
}) => {
  const handoverAt = new Date(deliveredAt);
  if (!Number.isFinite(handoverAt.getTime()) || handoverAt > new Date()) {
    throw StatusError.badRequest("Delivered time must be a valid time, not in the future");
  }

  if (riderId && Date.now() - handoverAt.getTime() > RIDER_BACKDATE_LIMIT_MS) {
    throw StatusError.badRequest("Delivered time can be at most 24 hours ago. Ask the office to record older deliveries.");
  }
  // Optional: a code that is entered must be right.
  const otpVerified = otp ? await verifyDeliveryOtp({ packageId, code: otp, riderId }) : false;

  const { order, previousStatus } = await withTransaction(async (session) => {
    const { pkg, order } = await loadManualPackage(packageId, session, riderId);
    if (!["packed", "out_for_delivery"].includes(pkg.status)) {
      throw StatusError.conflict(`Cannot mark delivered: package is "${pkg.status}".`);
    }
    const dispatchedAt = pkg.shipped_at || pkg.timeline?.[0]?.occurred_at || pkg.created_at;
    if (dispatchedAt && handoverAt < new Date(dispatchedAt)) {
      throw StatusError.badRequest("Delivered time cannot be before the package was dispatched");
    }

    const due = codAmountDue(order);
    if (due > 0) {
      if (!codCollection) throw StatusError.badRequest(`Record the ${order.currency} ${due} collected from the customer`);
      if (Math.round(Number(codCollection.amount) * 100) !== Math.round(due * 100)) {
        throw StatusError.badRequest(`Collected amount must equal the amount due (${due})`);
      }
      if (!COD_COLLECTION_METHODS.includes(codCollection.method)) {
        throw StatusError.badRequest("Collection method must be cash or upi");
      }
      if (codCollection.method === "upi" && !codCollection.reference?.trim()) {
        throw StatusError.badRequest("UPI reference is required");
      }
    } else if (codCollection) {
      throw StatusError.badRequest("Nothing is due on this order; do not record a collection");
    }

    const now = new Date();
    await Package.updateOne({ _id: pkg._id }, {
      $set: {
        status: "delivered",
        delivered_at: handoverAt,
        ...(pkg.shipped_at ? {} : { shipped_at: handoverAt }),
        proof_of_delivery: {
          receiver_name: receiverName.trim(),
          receiver_relation: receiverRelation?.trim() || null,
          delivered_at: handoverAt,
          photo_url: photoUrl || null,
          photo_key: photoKey || null,
          otp_verified: otpVerified,
          notes: notes?.trim() || null,
          recorded_by: adminId,
          recorded_at: now,
        },
      },
      $push: { timeline: { status: "delivered", occurred_at: handoverAt, raw: {
        source: riderId ? "delivery_staff" : "manual_fulfillment", mode: pkg.fulfillment_mode, changed_by: String(adminId), receiver_name: receiverName.trim(),
        otp_verified: otpVerified,
      } } },
    }, { session });

    const { order: recomputed } = await recomputeOrderStatus({ orderId: order._id, session });
    // recompute stamps "now"; the return window must run from the real handover.
    const set = { delivered_at: handoverAt, ...(recomputed.shipped_at ? {} : { shipped_at: handoverAt }) };
    if (due > 0) {
      await transitionOrder({
        orderId: order._id, paymentStatus: "paid", session,
        set: { ...set, paid_at: handoverAt, cod_collection: {
          amount: Number(codCollection.amount), method: codCollection.method,
          reference: codCollection.reference?.trim() || null,
          collected_by: pkg.delivery_agent?.name || null, collected_at: handoverAt,
          collected_by_user: pkg.delivery_agent?.user_id || null,
          recorded_by: adminId, recorded_at: now,
          // Only cash a rider carries away has to be handed in.
          handover: { status: codCollection.method === "cash" && pkg.fulfillment_mode === "self_delivery" ? "pending" : "not_required" },
        } },
      });
    } else {
      await Order.updateOne({ _id: order._id }, { $set: set }, { session });
    }
    await pushHistory(order._id, order.order_status, recomputed.order_status, `Delivered to ${receiverName.trim()}`, adminId, session);
    return { order: await Order.findById(order._id).session(session), previousStatus: order.order_status };
  });

  if (order.order_status === "delivered" && previousStatus !== "delivered") {
    sendOrderNotification({ order, event: "ORDER_DELIVERED", dedupeKey: `${order.id}:ORDER_DELIVERED` });
  }
  return { order };
};

/**
 * Logs a failed handover (customer unavailable, refused, wrong address).
 * The package stays where it is; after repeated failures the admin cancels
 * through the normal cancellation workflow.
 */
export const recordFailedAttempt = async ({ packageId, reason, adminId, riderId = null }) => withTransaction(async (session) => {
  const { pkg } = await loadManualPackage(packageId, session, riderId);
  if (!["packed", "out_for_delivery"].includes(pkg.status)) {
    throw StatusError.conflict(`Cannot record an attempt: package is "${pkg.status}".`);
  }
  const at = new Date();
  return Package.findOneAndUpdate({ _id: pkg._id }, { $push: {
    delivery_attempts: { at, reason: reason.trim(), recorded_by: adminId },
    timeline: { status: "delivery_attempt_failed", occurred_at: at, raw: {
      source: "manual_fulfillment", changed_by: String(adminId), reason: reason.trim(),
    } },
  } }, { new: true, session });
});

/**
 * Undelivered parcel is back at the store (rider couldn't hand it over, or
 * a pickup was never collected). Cancels the manual package and rolls the
 * order back to "processing" — an audited exception to the forward-only
 * transition table, valid because the goods are physically back with us.
 * The admin can then re-dispatch or cancel the order normally.
 */
export const returnToStore = async ({ packageId, reason, adminId }) => withTransaction(async (session) => {
  const { pkg, order } = await loadManualPackage(packageId, session);
  if (!["packed", "out_for_delivery"].includes(pkg.status)) {
    throw StatusError.conflict(`Cannot return to store: package is "${pkg.status}".`);
  }
  const active = await Package.countDocuments({ order_id: order._id, status: { $ne: "cancelled" } }).session(session);
  if (active > 1) throw StatusError.conflict("This order has other active packages; use the package workflow.");

  const now = new Date();
  await Package.updateOne({ _id: pkg._id }, {
    $set: { status: "cancelled", cancelled_at: now },
    $push: { timeline: { status: "returned_to_store", occurred_at: now, raw: {
      source: "manual_fulfillment", changed_by: String(adminId), reason: reason.trim(),
    } } },
  }, { session });

  const rolledBack = await Order.findOneAndUpdate(
    { _id: order._id, order_status: order.order_status },
    {
      $set: { order_status: "processing", shipped_at: null, processing_at: order.processing_at || now },
      $push: { manual_status_history: {
        from: order.order_status, to: "processing", reason: `Returned to store: ${reason.trim()}`,
        changed_by: adminId, changed_at: now,
      } },
    },
    { new: true, session },
  );
  if (!rolledBack) throw StatusError.conflict("Order status changed. Refresh and try again.");
  const { order: recomputed } = await recomputeOrderStatus({ orderId: order._id, session });
  return { order: recomputed };
});
