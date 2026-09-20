import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { StatusError } from "../../config/index.js";
import { findRemoteReference } from "./liveShiprocketImport.js";
import { registerExternalPackage } from "./packages/registerExternalPackage.js";
import { syncShiprocketStatus } from "./packages/syncShiprocketStatus.js";

const ACTIVE_PACKAGE_EXCLUDED_STATUSES = ["cancelled", "return_requested", "returned"];

/**
 * Backs the always-visible "Fetch current status" button on Order Details.
 * Unlike syncShiprocketStatus (which only resyncs an *existing* link),
 * this also covers an order with nothing linked yet: it searches
 * Shiprocket live by the order's own reference — the exact channel_order_id
 * we'd have sent when creating it (packageReference.js / Order.id) — and,
 * on a single unambiguous match, establishes the link via
 * registerExternalPackage (which does its own independent live
 * verification before writing anything).
 *
 * Always returns the same {order, changed, results} shape regardless of
 * which path was taken, so the controller/frontend don't need to care.
 */
export const fetchShiprocketDetailsForOrder = async ({ orderId, adminId }) => {
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  const activePackages = await Package.find({
    order_id: order._id,
    status: { $nin: ACTIVE_PACKAGE_EXCLUDED_STATUSES },
  });
  const alreadyLinked = !!order.shiprocket_order_id || activePackages.some((pkg) => pkg.shiprocket_order_id);
  if (alreadyLinked) return syncShiprocketStatus({ orderId, adminId });

  if (activePackages.length) {
    throw StatusError.conflict(
      "This order has packages that aren't linked to Shiprocket yet — retry or manage them from Manage Packages instead.",
    );
  }

  const matches = await findRemoteReference(order.id);
  if (!matches.length) {
    throw StatusError.notFound(`No Shiprocket order was found with reference "${order.id}". It may not have been booked yet.`);
  }
  if (matches.length > 1) {
    throw StatusError.conflict(
      `Multiple Shiprocket orders match reference "${order.id}" — link the correct one manually with its Shiprocket order ID.`,
    );
  }

  const { order: linkedOrder } = await registerExternalPackage({
    orderId,
    shiprocketOrderId: matches[0].id,
    adminId,
    reason: 'Linked via "Fetch current status" on Order Details (found live by order reference)',
  });
  return { order: linkedOrder, changed: true, results: [] };
};
