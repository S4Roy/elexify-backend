import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import { StatusError, envs } from "../../../config/index.js";
import { getIntegrationConfig } from "../../integrationCredentials/index.js";
import { buildPackagePayload, resolvePackageDims, extractShiprocketIds } from "./buildPackagePayload.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";

// Orders in these statuses have nothing left to ship or can never be
// shipped — creating a package is refused outright rather than relying
// solely on the quantity check to (indirectly) reject it.
const BLOCKED_ORDER_STATUSES = ["cancelled", "returned", "return_requested", "delivered", "failed"];

// Every shipment — including today's simple "ship the whole order in one
// go" — creates exactly one Package doc. When `items` is omitted, every
// order item's full remaining unpacked quantity is selected, reproducing
// today's whole-order-ship behavior exactly (this is what makes the
// existing admin/inventory/order/shipping endpoint's default call, with no
// `items` in the body, fully backward compatible). See the approved plan
// at /Users/subhankar/.claude/plans/optimized-sleeping-quokka.md.
export const createAndShipPackage = async ({
  orderId,
  items = null,
  pickupLocation,
  weight,
  length,
  width,
  height,
  adminId = null,
}) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw StatusError.notFound("Order not found");

  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");
  if (BLOCKED_ORDER_STATUSES.includes(order.order_status)) {
    throw StatusError.conflict(`Cannot create a package: order is "${order.order_status}".`);
  }

  const shiprocketConfig = await getIntegrationConfig("shiprocket", { channel_id: envs.shiprocket?.channel_id });
  if (!shiprocketConfig) throw StatusError.serviceUnavailable("Shiprocket integration is disabled");

  let pkg;
  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();

    const orderItems = await OrderItem.find({ order_id: order._id }).session(dbSession);
    const allPackages = await Package.find({ order_id: order._id }).session(dbSession);
    const nonCancelledPackages = allPackages.filter((p) => p.status !== "cancelled");

    const allocatedByItem = new Map();
    for (const existing of nonCancelledPackages) {
      for (const line of existing.items) {
        const key = String(line.order_item_id);
        allocatedByItem.set(key, (allocatedByItem.get(key) || 0) + line.quantity);
      }
    }

    let requestedItems;
    if (Array.isArray(items) && items.length) {
      requestedItems = items.map((line) => ({
        order_item_id: line.order_item_id,
        quantity: Number(line.quantity),
      }));
      for (const line of requestedItems) {
        const orderItem = orderItems.find((oi) => String(oi._id) === String(line.order_item_id));
        if (!orderItem) throw StatusError.badRequest("One or more items do not belong to this order");
        if (!(line.quantity > 0)) throw StatusError.badRequest(`Quantity for ${orderItem.sku || orderItem.product_name} must be greater than 0`);
        const alreadyAllocated = allocatedByItem.get(String(orderItem._id)) || 0;
        const remaining = orderItem.quantity - alreadyAllocated;
        if (line.quantity > remaining) {
          throw StatusError.conflict(
            `Only ${remaining} unpacked unit(s) remain for ${orderItem.sku || orderItem.product_name}`,
          );
        }
      }
    } else {
      requestedItems = orderItems
        .map((orderItem) => {
          const alreadyAllocated = allocatedByItem.get(String(orderItem._id)) || 0;
          const remaining = orderItem.quantity - alreadyAllocated;
          return remaining > 0 ? { order_item_id: orderItem._id, quantity: remaining } : null;
        })
        .filter(Boolean);
    }

    if (!requestedItems.length) {
      throw StatusError.badRequest("All items in this order are already packed.");
    }

    const nextPackageNumber = allPackages.reduce((max, p) => Math.max(max, p.package_number), 0) + 1;
    const dims = resolvePackageDims({
      qWeight: weight,
      qLength: length,
      qWidth: width,
      qHeight: height,
      packageOrderItems: orderItems.filter((oi) => requestedItems.some((r) => String(r.order_item_id) === String(oi._id))),
    });

    const [created] = await Package.create(
      [
        {
          order_id: order._id,
          package_number: nextPackageNumber,
          items: requestedItems,
          weight: dims.weight,
          length: dims.length,
          width: dims.width,
          height: dims.height,
          pickup_location: pickupLocation || null,
          status: "packed",
          integration_status: "pending",
          created_by: adminId,
        },
      ],
      { session: dbSession },
    );
    pkg = created;

    // fully_packed/package_count reflect allocation, independent of the
    // Shiprocket API outcome below — once items are allocated to this
    // package they can't be repacked elsewhere even if the API call fails
    // (the admin retries or cancels this same package instead).
    const updatedAllocated = new Map(allocatedByItem);
    for (const line of requestedItems) {
      const key = String(line.order_item_id);
      updatedAllocated.set(key, (updatedAllocated.get(key) || 0) + line.quantity);
    }
    const fullyPacked = orderItems.every((oi) => (updatedAllocated.get(String(oi._id)) || 0) >= oi.quantity);
    await Order.updateOne(
      { _id: order._id },
      { $set: { package_count: nonCancelledPackages.length + 1, fully_packed: fullyPacked } },
      { session: dbSession },
    );

    await dbSession.commitTransaction();
  } catch (error) {
    await dbSession.abortTransaction().catch(() => {});
    throw error;
  } finally {
    dbSession.endSession();
  }

  // ── Outside the transaction: the external Shiprocket call ──────────────
  // Re-read with the full product/address enrichment needed to build the
  // Shiprocket payload, same helper shipping.js already used.
  const { inventoryService, shiprocket, notificationService } = await import("../../index.js");
  const order_data = await inventoryService.orderService.details(order._id);

  const payload = buildPackagePayload({
    order_data,
    shiprocketConfig,
    pkg: { package_number: pkg.package_number, items: pkg.items },
    pickupLocation,
    dims: { weight: pkg.weight, length: pkg.length, width: pkg.width, height: pkg.height },
  });

  let createOrderResp;
  try {
    createOrderResp = await shiprocket.createOrder(payload);
  } catch (err) {
    createOrderResp = { success: false, error: err?.message || String(err) };
  }

  if (createOrderResp?.success) {
    const { shiprocket_order_id, shiprocket_shipment_id, courier_name, awb } = extractShiprocketIds(createOrderResp);
    pkg = await Package.findByIdAndUpdate(
      pkg._id,
      {
        $set: {
          integration_status: "created",
          shiprocket_order_id,
          shiprocket_shipment_id,
          courier_name,
          awb,
          booking_snapshot: payload,
          last_error: null,
        },
      },
      { new: true },
    );
  } else {
    // Whether this was a definite rejection or an ambiguous network
    // timeout, Shiprocket may or may not have actually created the
    // shipment on its side — so it's conservatively marked "unknown"
    // (never assumed either way) rather than "failed", mirroring
    // returnService/pickup.js's identical handling of this same ambiguity.
    // Either way the allocation stays put and "Retry" targets this same
    // Package doc, never a new one, so a retry can never duplicate a
    // shipment.
    pkg = await Package.findByIdAndUpdate(
      pkg._id,
      {
        $set: {
          status: "failed",
          integration_status: "unknown",
          last_error:
            typeof createOrderResp?.error === "string"
              ? createOrderResp.error
              : JSON.stringify(createOrderResp?.error || "Unknown error"),
          booking_snapshot: payload,
        },
        $inc: { attempt_count: 1 },
      },
      { new: true },
    );
  }

  // The order only actually enters "packed" once Shiprocket confirms —
  // matches today's exact single-shipment semantic. A failed attempt
  // leaves order_status untouched; the admin retries or cancels this
  // package instead of the allocation silently disappearing.
  let statusChanged = false;
  if (pkg.integration_status === "created") {
    const result = await recomputeOrderStatus({ orderId: order._id, source: "application" });
    statusChanged = result.statusChanged && result.previousStatus !== "packed" && result.order.order_status === "packed";
    if (statusChanged) {
      notificationService.sendOrderNotification({
        order: result.order,
        event: "ORDER_PACKED",
        dedupeKey: `${result.order.id}:ORDER_PACKED`,
      });
    }
  }

  return { pkg, orderId: order._id };
};
