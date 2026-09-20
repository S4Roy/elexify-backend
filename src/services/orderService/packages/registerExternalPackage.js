import { canCorrectHistoricalDelivery } from "../historicalDelivery.js";
import { applyManualOrderStatusChange } from "../manualOrderStatus.js";
import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import { StatusError } from "../../../config/index.js";
import { returnApi } from "../../shiprocket/returnShipment.js";
import { packageReference } from "./packageReference.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";
import { normalizeOrderStatus } from "../../../helpers/order/normalizeOrderStatus.js";
import { PACKAGE_STATUS_MAP } from "../../../helpers/order/packageStatus.js";

// Orders in these statuses have nothing left to ship or can never be
// shipped — mirrors createAndShipPackage.js's own guard.
const BLOCKED_ORDER_STATUSES = ["cancelled", "returned", "return_requested", "delivered", "failed"];

/**
 * Lets an admin link an order to a Shiprocket order that was created
 * out-of-band (booked directly in the Shiprocket dashboard because our own
 * automated packing/shipping call never ran, the order predates this
 * integration, or it's a legacy/imported order that never got a proper
 * link) — instead of the old shortcut of typing a bare status label with
 * no shipment behind it at all.
 *
 * Mirrors the exact verification pattern services/returnService/pickup.js's
 * bookReversePickup already uses for the same real-world situation on the
 * reverse-shipment side:
 *   1. Live GET the Shiprocket order by the admin-supplied numeric id.
 *   2. Cross-check its channel_order_id against the reference_id our own
 *      integration would have sent (packageReference(order.id, N)) — this
 *      is what actually proves the Shiprocket order belongs to THIS order,
 *      not just that *some* Shiprocket order with that id exists. Ops are
 *      expected to enter that reference as the "Channel Order ID" when
 *      booking manually in Shiprocket, same convention as the return flow.
 *   3. Only then create the Package doc, populated from the *verified*
 *      response (courier, AWB, ETD, and current shipment status) — never
 *      from whatever sub-fields the admin might type.
 *
 * Scoped to registering exactly one package covering the order's full
 * quantity (package_number 1) — an order that already has packages doesn't
 * need this; it already has real Package docs, and the ordinary cascade
 * path in manualOrderStatus.js covers correcting their status.
 */
export const registerExternalPackage = async ({ orderId, shiprocketOrderId, reason, adminId, legacyDeliveredImport = false }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw StatusError.notFound("Order not found");
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");
  if (BLOCKED_ORDER_STATUSES.includes(order.order_status) && !(legacyDeliveredImport && order.order_status === "delivered")) {
    throw StatusError.conflict(`Cannot register a package: order is "${order.order_status}".`);
  }
  if (order.inventory_reverted || (order.refund?.status && order.refund.status !== "not_required")) {
    throw StatusError.conflict("This order has cancellation, return, or refund effects and cannot be packed manually");
  }

  const [orderItems, existingPackages] = await Promise.all([
    OrderItem.find({ order_id: order._id }),
    Package.find({ order_id: order._id }),
  ]);
  if (existingPackages.some((p) => p.status !== "cancelled")) {
    throw StatusError.conflict(
      "This order already has packages. Use the package workflow to add another, or the status correction tool to update the existing ones.",
    );
  }
  if (!orderItems.length) throw StatusError.badRequest("This order has no items to pack.");

  const packageNumber = existingPackages.reduce((max, p) => Math.max(max, p.package_number), 0) + 1;
  const referenceId = packageReference(order.id, packageNumber);

  // ── Live verification against Shiprocket — never trust the admin's typed sub-fields ──
  let remote;
  try {
    remote = (await returnApi("GET", `orders/show/${encodeURIComponent(shiprocketOrderId)}`)).data;
  } catch (err) {
    throw StatusError.badRequest("Could not verify this Shiprocket order. Check the order ID and try again.");
  }
  if (!remote?.id) throw StatusError.badRequest("Shiprocket order was not found.");
  if (String(remote.channel_order_id) !== referenceId && !(legacyDeliveredImport && String(remote.channel_order_id) === String(order.id))) {
    throw StatusError.badRequest(
      `This Shiprocket order is not linked to this order (expected channel order ID "${referenceId}", got "${remote.channel_order_id}").`,
    );
  }
  const shipment = Array.isArray(remote.shipments) ? remote.shipments[0] : remote.shipments;
  if (!shipment?.id) throw StatusError.badRequest("This Shiprocket order has no shipment yet.");

  if (legacyDeliveredImport && normalizeOrderStatus(shipment.current_status || remote.status) !== "delivered") {
    throw StatusError.conflict("Shiprocket no longer reports this shipment as delivered.");
  }
  if ((order.payment_method === "razorpay" || order.is_partial_cod) && !["paid", "advance_paid"].includes(order.payment_status) && !canCorrectHistoricalDelivery(order, legacyDeliveredImport, normalizeOrderStatus(shipment.current_status || remote.status)) && !(legacyDeliveredImport && order.order_status === "delivered")) {
    throw StatusError.conflict("Record the received payment before advancing fulfillment.");
  }

  const items = orderItems.map((oi) => ({ order_item_id: oi._id, quantity: oi.quantity }));
  const previousStatus = order.order_status;

  // Derive the package's actual status from what Shiprocket reports for
  // this shipment right now — never assume "packed" just because that's
  // usually the first stage. A courier booked days ago out-of-band may
  // already be shipped, out for delivery, or delivered by the time an
  // admin gets around to linking it, and recording "packed" for that would
  // be its own false record, exactly what this whole flow exists to avoid.
  // Falls back to "packed" only when Shiprocket's status text is missing or
  // one we don't recognize.
  const derivedStatus = PACKAGE_STATUS_MAP[normalizeOrderStatus(shipment.current_status || remote.status)] || "packed";
  const now = new Date();

  let pkg;
  try {
    [pkg] = await Package.create([{
      order_id: order._id,
      package_number: packageNumber,
      reference_id: String(remote.channel_order_id),
      items,
      status: derivedStatus,
      integration_status: "created",
      shiprocket_order_id: String(remote.id),
      shiprocket_shipment_id: String(shipment.id),
      awb: shipment.awb || null,
      courier_name: shipment.courier_name || null,
      etd: shipment.etd || null,
      shipped_at: ["shipped", "out_for_delivery", "delivered"].includes(derivedStatus) ? now : null,
      delivered_at: derivedStatus === "delivered" ? now : null,
      timeline: [{ status: derivedStatus, occurred_at: now, raw: { source: "manual_admin_link", changed_by: String(adminId), reason: reason.trim(), shiprocket_status: shipment.current_status || null } }],
      booking_snapshot: remote,
      created_by: adminId,
    }]);
  } catch (error) {
    if (error?.code === 11000) {
      throw StatusError.conflict("This Shiprocket order, shipment, or AWB is already linked to a different package.");
    }
    throw error;
  }

  // Historical imports can still be pending/confirmed locally. Once the
  // verified package exists, use the audited correction path for that jump.
  if (legacyDeliveredImport && previousStatus !== "delivered") {
    await applyManualOrderStatusChange({ order, status: "delivered", reason, changedBy: adminId, historicalDeliveryVerified: legacyDeliveredImport });
  }
  const { order: recomputed } = await recomputeOrderStatus({ orderId: order._id, source: legacyDeliveredImport ? "reconciliation" : "application" });
  if (!legacyDeliveredImport && recomputed.order_status !== previousStatus) {
    await Order.updateOne({ _id: order._id }, { $push: { manual_status_history: {
      from: previousStatus, to: recomputed.order_status, reason: reason.trim(),
      changed_by: adminId, changed_at: new Date(),
    } } });
  }

  return { pkg, order: recomputed };
};
