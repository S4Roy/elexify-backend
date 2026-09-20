import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { StatusError } from "../../config/index.js";
import { returnApi } from "../shiprocket/returnShipment.js";
import { findRemoteReference } from "./liveShiprocketImport.js";
import { registerExternalPackage } from "./packages/registerExternalPackage.js";

const extractDetails = (remote) => {
  const shipment = Array.isArray(remote?.shipments) ? remote.shipments[0] : remote?.shipments;
  return {
    shiprocket_order_id: remote?.id != null ? String(remote.id) : null,
    channel_order_id: remote?.channel_order_id || null,
    channel_name: remote?.channel_name || null,
    status: shipment?.current_status || remote?.status || null,
    shipment_id: shipment?.id != null ? String(shipment.id) : null,
    awb: shipment?.awb || null,
    courier_name: shipment?.courier_name || null,
    etd: shipment?.etd || null,
  };
};

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

/**
 * "Fetch Shiprocket details" button on Order Details, for an order in
 * *any* status.
 *
 * - Already linked locally (a Package or the legacy Order.shiprocket_order_id
 *   field) — just looks up and returns what Shiprocket currently reports.
 *   Never writes anything here: the data already exists in our DB, so
 *   there's nothing to save, only to display.
 * - Not linked locally yet — searches Shiprocket live by the order's own
 *   reference (its human id, the exact channel_order_id we'd have sent
 *   when creating it), and on a single unambiguous match, *does* write:
 *   establishes the link via registerExternalPackage, which independently
 *   re-verifies the match live before creating anything — the same
 *   verified-linking convention every other manual-link path in this
 *   codebase already follows, never a blind write from admin-typed input.
 */
export const fetchShiprocketDetailsForOrder = async ({ orderId, adminId }) => {
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  const packages = await Package.find({ order_id: order._id });
  const linkedId = order.shiprocket_order_id
    || packages.find((pkg) => pkg.shiprocket_order_id)?.shiprocket_order_id;

  if (linkedId) {
    const remote = await fetchRemoteOrder(linkedId);
    return { found: true, linked_now: false, details: extractDetails(remote) };
  }

  if (packages.length) {
    // Has packages, but none carry a Shiprocket link yet — don't guess
    // which one a fresh search should attach to; that needs the
    // dedicated package retry/manage workflow, not this button.
    return {
      found: false,
      message: "This order has packages that aren't linked to Shiprocket yet — retry or manage them from Manage Packages instead.",
    };
  }

  const matches = await findRemoteReference(order.id);
  if (!matches.length) {
    return { found: false, message: `No Shiprocket order was found with reference "${order.id}".` };
  }
  if (matches.length > 1) {
    return {
      found: false,
      message: `${matches.length} Shiprocket orders match reference "${order.id}" — review them directly in Shiprocket.`,
    };
  }

  await registerExternalPackage({
    orderId,
    shiprocketOrderId: matches[0].id,
    adminId,
    reason: 'Linked via "Fetch Shiprocket details" on Order Details (found live by order reference)',
  });
  const remote = await fetchRemoteOrder(matches[0].id);
  return { found: true, linked_now: true, details: extractDetails(remote) };
};
