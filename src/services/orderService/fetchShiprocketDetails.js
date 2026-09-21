import { syncShiprocketStatus } from "./packages/syncShiprocketStatus.js";
import { selectRemoteShipment, shipmentDetails } from "./packages/applyShiprocketShipment.js";
import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { StatusError } from "../../config/index.js";
import { returnApi } from "../shiprocket/returnShipment.js";
import { findRemoteReference } from "./liveShiprocketImport.js";
import { registerExternalPackage } from "./packages/registerExternalPackage.js";
import { normalizeOrderStatus } from "../../helpers/order/normalizeOrderStatus.js";

const extractDetails = remote => shipmentDetails(remote, selectRemoteShipment(remote));

const fetchRemoteOrder = async (shiprocketOrderId) => {
  let remote;
  try {
    remote = (await returnApi("GET", `orders/show/${encodeURIComponent(shiprocketOrderId)}`)).data;
  } catch (error) {
    throw StatusError.badRequest("Could not reach Shiprocket. Try again shortly.");
  }
  if (!remote?.id) throw StatusError.notFound("Shiprocket no longer has this order.");
  return remote;
};

// Existing links are synced package-by-package. Unlinked legacy discovery
// retains its verified delivered-only linking policy.
export const fetchShiprocketDetailsForOrder = async ({ orderId, adminId, channelId, packageIds = null }) => {
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  const packages = await Package.find({ order_id: order._id });
  if (packages.length || order.shiprocket_order_id) {
    const synced = await syncShiprocketStatus({ orderId, adminId, packageIds });
    return { found: !!synced.details || synced.results.some(result => !!result.details), linked_now: false,
      changed: synced.changed, order_status: synced.order.order_status,
      details: synced.details, packages: synced.results, outcome: synced.outcome,
      reconciliation_error: synced.reconciliation_error };
  }
  if (packageIds?.length) throw StatusError.badRequest("This order has no packages to retry");

  // Scope the live search to a single sales channel when one is given (the
  // admin picks it from a dropdown backed by Shiprocket's registered
  // channels, defaulting to the account's configured channel_id) — an
  // account with several channels can otherwise return an order booked
  // under a different storefront that merely reused the same reference.
  const matches = await findRemoteReference(order.id, channelId ? { channel_id: channelId } : {});
  if (!matches.length) {
    return { found: false, message: `No Shiprocket order was found with reference "${order.id}".` };
  }
  if (matches.length > 1) {
    return {
      found: false,
      message: `${matches.length} Shiprocket orders match reference "${order.id}" — review them directly in Shiprocket.`,
    };
  }

  // A match found only by the order's bare id (no "-P<n>" suffix) is the
  // legacy single-shipment channel-order-id convention — registerExternalPackage's
  // ordinary verification expects the current multi-package reference
  // format instead, so writing this link requires its dedicated
  // historical-delivery bypass (legacyDeliveredImport), which is reserved
  // for a *confirmed delivery* specifically. So: check Shiprocket's live
  // status first, and only write when it's actually "delivered" — for
  // anything still in progress, show what was found without writing;
  // linking a still-moving legacy shipment stays a deliberate action via
  // Change Status -> Link Shiprocket order instead of an automatic one
  // from a details lookup.
  const remote = await fetchRemoteOrder(matches[0].id);
  const shipment = selectRemoteShipment(remote);
  const isDelivered = normalizeOrderStatus(shipment?.current_status || remote?.status) === "delivered";
  if (!isDelivered) {
    return { found: true, linked_now: false, details: extractDetails(remote) };
  }

  await registerExternalPackage({
    orderId,
    shiprocketOrderId: matches[0].id,
    adminId,
    legacyDeliveredImport: true,
    reason: 'Linked via "Fetch Shiprocket details" on Order Details (found live by order reference, confirmed delivered)',
  });
  const linkedRemote = await fetchRemoteOrder(matches[0].id);
  return { found: true, linked_now: true, details: extractDetails(linkedRemote) };
};
