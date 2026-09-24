import OrderScans from "../../../models/OrderScans.js";
import { shiprocketEventDate } from "../../../helpers/order/shiprocketStatus.js";

// Shiprocket sends scans in two shapes — webhook `scans[]` and the tracking
// API's `shipment_track_activities[]` — with slightly different keys. Both
// carry IST wall-clock times without an offset ("2026-09-24 14:37:01"),
// which shiprocketEventDate() interprets in Asia/Kolkata.
export const normalizeScan = (s = {}) => {
  const activity = String(s.activity || s.activity_text || s.status || "").trim();
  if (!activity) return null;
  const rawDate = s.date || s.scanned_at || s.timestamp || null;
  return {
    date: rawDate ? shiprocketEventDate(rawDate) : null,
    activity,
    location: String(s.location || s.place || "").trim(),
    status_label: String(s["sr-status-label"] || s.sr_status_label || "").trim() || null,
  };
};

/**
 * Idempotently stores courier scans for one shipment. Each scan is an
 * upsert keyed on (order_id, awb, date, activity), so webhook redeliveries
 * and repeated tracking refreshes never create duplicates — and, unlike the
 * old find-then-insert, the key is scoped to this order and AWB.
 * Returns the number of newly inserted scans.
 */
export const recordScans = async ({ orderId, packageId = null, awb = null, scans = [], source = "webhook" }) => {
  if (!orderId || !Array.isArray(scans) || !scans.length) return 0;
  const ops = [];
  for (const raw of scans) {
    const scan = normalizeScan(raw);
    if (!scan) continue;
    const key = { order_id: orderId, awb: awb ? String(awb) : null, date: scan.date, activity: scan.activity };
    ops.push({
      updateOne: {
        filter: key,
        update: {
          $setOnInsert: { ...key, package_id: packageId, location: scan.location, status_label: scan.status_label, source, raw },
        },
        upsert: true,
      },
    });
  }
  if (!ops.length) return 0;
  try {
    const result = await OrderScans.bulkWrite(ops, { ordered: false });
    return result.upsertedCount ?? 0;
  } catch (error) {
    // A concurrent writer inserting the same scan hits the unique index —
    // that's the dedupe working, not a failure.
    if (error?.code === 11000 || error?.writeErrors?.every?.((e) => e.code === 11000)) {
      return error?.result?.nUpserted ?? 0;
    }
    throw error;
  }
};
