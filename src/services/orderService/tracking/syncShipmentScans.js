import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import { returnApi } from "../../shiprocket/returnShipment.js";
import { recordScans } from "./recordScans.js";

// Customer tracking views pull the courier's full scan log on demand, so the
// activity log stays complete even if a webhook was missed. This is display
// data only: it records scans, the tracking link and ETA, but never changes
// package/order status — status transitions stay with the webhook and the
// admin "fetch current status" sync, which own notifications and derivation.
export const TRACKING_SYNC_TTL_MS = 15 * 60 * 1000;
// Admin "Refresh" bypasses the TTL but still can't hammer the courier API.
export const TRACKING_FORCE_SYNC_TTL_MS = 60 * 1000;
const FINAL_STATUSES = new Set(["delivered", "cancelled", "returned"]);
const MAX_SHIPMENTS_PER_SYNC = 5;

export const fetchAwbTracking = async (awb) => {
  const data = await returnApi("GET", `courier/track/awb/${encodeURIComponent(awb)}`);
  const tracking = data?.tracking_data ?? {};
  const shipment = tracking.shipment_track?.[0] ?? {};
  return {
    activities: Array.isArray(tracking.shipment_track_activities) ? tracking.shipment_track_activities : [],
    trackUrl: typeof tracking.track_url === "string" && tracking.track_url.startsWith("https://") ? tracking.track_url : null,
    etd: tracking.etd || shipment.edd || null,
  };
};

/**
 * Atomically claims a shipment for refresh so concurrent page views don't
 * all hit Shiprocket: only the request that moves tracking_synced_at past the
 * TTL gets to fetch. Delivered/cancelled/returned shipments are refreshed
 * once (to backfill their log) and then never again.
 */
const claim = async (Model, doc, now, force = false) => {
  if (!doc?.awb) return false;
  if (!force && FINAL_STATUSES.has(doc.status || doc.order_status) && doc.tracking_synced_at) return false;
  const cutoff = new Date(now.getTime() - (force ? TRACKING_FORCE_SYNC_TTL_MS : TRACKING_SYNC_TTL_MS));
  const res = await Model.updateOne(
    { _id: doc._id, $or: [{ tracking_synced_at: null }, { tracking_synced_at: { $lt: cutoff } }] },
    { $set: { tracking_synced_at: now } },
  );
  return res.modifiedCount === 1;
};

const syncOne = async ({ Model, doc, orderId, packageId }) => {
  const { activities, trackUrl, etd } = await fetchAwbTracking(doc.awb);
  const inserted = await recordScans({ orderId, packageId, awb: doc.awb, scans: activities, source: "tracking_api" });
  const set = {};
  if (trackUrl && !doc.tracking_url) set.tracking_url = trackUrl;
  if (etd && !FINAL_STATUSES.has(doc.status || doc.order_status)) set.etd = String(etd);
  if (Object.keys(set).length) await Model.updateOne({ _id: doc._id }, { $set: set });
  return inserted;
};

/**
 * Refreshes courier scans for an order's shipments (packages, or the legacy
 * order-level AWB). Never throws — tracking must still render from stored
 * data when Shiprocket is slow, down or not configured. `force` (admin
 * refresh) shortens the throttle to a minute and re-checks final shipments.
 */
export const syncShipmentScans = async ({ order, packages = [], force = false }) => {
  const now = new Date();
  const jobs = [];
  if (packages.length) {
    for (const pkg of packages.filter((p) => p.awb).slice(0, MAX_SHIPMENTS_PER_SYNC)) {
      if (await claim(Package, pkg, now, force)) {
        jobs.push(syncOne({ Model: Package, doc: pkg, orderId: order._id, packageId: pkg._id }));
      }
    }
  } else if (order.awb && (await claim(Order, order, now, force))) {
    jobs.push(syncOne({ Model: Order, doc: order, orderId: order._id, packageId: null }));
  }
  if (!jobs.length) return { refreshed: 0, inserted: 0 };
  const results = await Promise.allSettled(jobs);
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.warn("Tracking refresh failed:", r.reason?.message || r.reason));
  return {
    refreshed: results.filter((r) => r.status === "fulfilled").length,
    inserted: results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value : 0), 0),
  };
};
