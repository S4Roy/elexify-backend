import mongoose from "mongoose";
import Package from "../../../models/Package.js";
import { StatusError, envs } from "../../../config/index.js";
import { getIntegrationConfig } from "../../integrationCredentials/index.js";
import { buildPackagePayload, resolveBillingAddress, extractShiprocketIds, assignShipmentAwb } from "./buildPackagePayload.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";

// Re-attempts the Shiprocket call for an existing failed/unknown package —
// never allocates new quantity and never creates a second Package doc, so
// a retry can never produce a duplicate shipment/AWB for the same items.
export const retryPackageShipment = async ({ packageId }) => {
  if (!mongoose.Types.ObjectId.isValid(packageId)) throw StatusError.notFound("Package not found");

  const pkg = await Package.findById(packageId);
  if (!pkg) throw StatusError.notFound("Package not found");
  if (!["failed", "unknown"].includes(pkg.integration_status)) {
    throw StatusError.conflict("Only a failed or unreconciled package can be retried.");
  }

  const { inventoryService, shiprocket, notificationService } = await import("../../index.js");
  const order_data = await inventoryService.orderService.details(pkg.order_id);
  if (!resolveBillingAddress(order_data)) {
    throw StatusError.badRequest("This order has no billing or shipping address for the shipment.");
  }

  // Atomically claim this package for a retry attempt, so a double-click
  // or concurrent retry can't both call Shiprocket for the same package.
  const claimed = await Package.findOneAndUpdate(
    { _id: pkg._id, integration_status: pkg.integration_status },
    { $set: { integration_status: "pending" }, $inc: { attempt_count: 1 }, $currentDate: { last_attempt_at: true } },
    { new: true },
  );
  if (!claimed) throw StatusError.conflict("This package is already being retried.");

  const shiprocketConfig = await getIntegrationConfig("shiprocket", { channel_id: envs.shiprocket?.channel_id });
  if (!shiprocketConfig) throw StatusError.serviceUnavailable("Shiprocket integration is disabled");

  const payload = buildPackagePayload({
    order_data,
    shiprocketConfig,
    pkg: { package_number: claimed.package_number, items: claimed.items },
    pickupLocation: claimed.pickup_location,
    dims: { weight: claimed.weight, length: claimed.length, width: claimed.width, height: claimed.height },
  });

  let createOrderResp;
  try {
    createOrderResp = await shiprocket.createOrder(payload);
  } catch (err) {
    createOrderResp = { success: false, error: err?.message || String(err) };
  }

  let updated;
  if (createOrderResp?.success) {
    let { shiprocket_order_id, shiprocket_shipment_id, courier_name, awb } = extractShiprocketIds(createOrderResp);
    let awbError = null;
    if (!awb && shiprocket_shipment_id) {
      const assigned = await assignShipmentAwb({ shiprocket, shiprocketShipmentId: shiprocket_shipment_id });
      if (assigned.awb) {
        awb = assigned.awb;
        courier_name = assigned.courier_name || courier_name;
      } else {
        awbError = assigned.error;
      }
    }
    updated = await Package.findByIdAndUpdate(
      claimed._id,
      {
        $set: {
          status: "packed",
          integration_status: "created",
          shiprocket_order_id,
          shiprocket_shipment_id,
          courier_name,
          awb,
          booking_snapshot: payload,
          last_error: awbError,
        },
      },
      { new: true },
    );
  } else {
    updated = await Package.findByIdAndUpdate(
      claimed._id,
      {
        $set: {
          status: "failed",
          integration_status: "unknown",
          last_error:
            typeof createOrderResp?.error === "string" ? createOrderResp.error : JSON.stringify(createOrderResp?.error || "Unknown error"),
          booking_snapshot: payload,
        },
      },
      { new: true },
    );
  }

  if (updated.integration_status === "created") {
    const result = await recomputeOrderStatus({ orderId: updated.order_id, source: "application" });
    if (result.statusChanged && result.order.order_status === "packed") {
      notificationService.sendOrderNotification({
        order: result.order,
        event: "ORDER_PACKED",
        dedupeKey: `${result.order.id}:ORDER_PACKED`,
      });
    }
  }

  return updated;
};
