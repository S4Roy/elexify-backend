import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { StatusError } from "../../config/index.js";
import { returnApi } from "../shiprocket/returnShipment.js";
import { findRemoteReference } from "./liveShiprocketImport.js";

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
 * Read-only "Fetch Shiprocket details" button on Order Details. Works for
 * an order in *any* status and never writes to the database — it only
 * looks up and returns what Shiprocket currently reports, for an admin to
 * read. Applying any resulting status/courier change is a separate,
 * explicit action (Change Status -> Link Shiprocket order, or the CSV
 * reconciliation flow) — this never does that itself.
 */
export const fetchShiprocketDetailsForOrder = async ({ orderId }) => {
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  const packages = await Package.find({ order_id: order._id });
  const linkedId = order.shiprocket_order_id
    || packages.find((pkg) => pkg.shiprocket_order_id)?.shiprocket_order_id;

  if (linkedId) {
    const remote = await fetchRemoteOrder(linkedId);
    return { found: true, details: extractDetails(remote) };
  }

  // Nothing linked locally yet — search Shiprocket live by this order's
  // own reference (its human id, the exact channel_order_id we'd have
  // sent when creating it). Read-only: a match is only ever displayed,
  // never linked, from this action.
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

  const remote = await fetchRemoteOrder(matches[0].id).catch(() => matches[0]);
  return { found: true, details: extractDetails(remote) };
};
