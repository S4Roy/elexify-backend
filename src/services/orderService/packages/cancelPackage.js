import mongoose from "mongoose";
import Package from "../../../models/Package.js";
import { StatusError } from "../../../config/index.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";

// Cancelling a package is only allowed pre-shipment (nothing has been
// handed to the courier yet) — releases its allocation so the items can be
// re-packed into a new package. If a Shiprocket shipment was already
// created for it, that shipment is cancelled on Shiprocket's side too.
export const cancelPackage = async ({ packageId }) => {
  if (!mongoose.Types.ObjectId.isValid(packageId)) throw StatusError.notFound("Package not found");

  const pkg = await Package.findById(packageId);
  if (!pkg) throw StatusError.notFound("Package not found");
  if (!["packed", "failed"].includes(pkg.status)) {
    throw StatusError.conflict("This package has already shipped and can no longer be cancelled.");
  }

  if (pkg.shiprocket_order_id && pkg.integration_status === "created") {
    const { shiprocket } = await import("../../index.js");
    const result = await shiprocket.cancelOrder(pkg.shiprocket_order_id).catch((err) => ({ success: false, error: err?.message }));
    if (!result?.success) {
      throw StatusError.badRequest(
        "Could not cancel the shipment on Shiprocket. Please cancel it there directly before cancelling this package.",
      );
    }
  }

  const updated = await Package.findByIdAndUpdate(
    pkg._id,
    { $set: { status: "cancelled", cancelled_at: new Date() } },
    { new: true },
  );

  await recomputeOrderStatus({ orderId: updated.order_id, source: "application" });
  return updated;
};
