// Reconciles Order/Package status from a Shiprocket order export (CSV,
// columns: "Order ID", "Status" [Shiprocket's current status text],
// optionally "Channel").
//
// Shiprocket's own export report echoes back the *channel order id* we
// sent it when the order/package was created, not Shiprocket's internal
// numeric order id — verified directly against a real export, "Order ID"
// values come in three exact shapes:
//   - "<Order.id>-P<n>"  — a Package created under the current
//     multi-package flow; sent as reference_id (packageReference.js) and
//     stored right back on that Package doc's own reference_id field.
//   - "<Order.id>"  (no "-P" suffix) — a pre-Package-model order shipped
//     under the old single-shipment flow, where the channel order id we
//     sent Shiprocket was simply the order's own human id.
//   - a bare number — an order Shiprocket has no channel reference for at
//     all (booked directly in the Shiprocket dashboard, outside our
//     system entirely); these have nothing local to match and correctly
//     end up unmatched.
// Package.shiprocket_order_id / Order.shiprocket_order_id (Shiprocket's
// own internal numeric id, extractShiprocketIds.js) are tried only as a
// last-resort fallback — this is what the live webhook correlates on when
// a request carries that id instead, but it's essentially never what this
// export's "Order ID" column actually contains.
//
// Every lookup here is an exact-id join against a field WE already
// populated when the order/package was created or last linked — never a
// fuzzy match. Rows whose Order ID doesn't match any local Package or
// Order are reported as unmatched, not guessed at; those need the "link
// Shiprocket order" admin action (registerExternalPackage) run one at a
// time, since only a live verified lookup can safely establish a *new*
// link.
//
// Two callers share this pure DB-matching logic (no file I/O here — see
// callers for that):
//   - src/scripts/reconcileShiprocketOrderStatus.js — CLI, reads a CSV off
//     disk, dry-run by default.
//   - src/controllers/admin/inventory/order/reconciliation/*.js — the admin
//     panel's upload-CSV -> audit -> apply flow, gated behind
//     ORDER_STATUS_MANAGE and a typed confirmation on the apply step.
//
// Never sends customer notifications (this is historical/backfill data,
// not a live event) and never re-derives payment status beyond the one
// COD-completion rule the live webhook itself already applies on delivery.
import { Readable } from "stream";
import csv from "csv-parser";
import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { normalizeOrderStatus } from "../../helpers/order/normalizeOrderStatus.js";
import { PACKAGE_STATUS_MAP, isForwardPackageTransition } from "../../helpers/order/packageStatus.js";
import { applyManualOrderStatusChange, STATUS_RANK } from "./manualOrderStatus.js";
import { recomputeOrderStatus } from "./packages/recomputeOrderStatus.js";
import { createLogger } from "../../scripts/shared/logger.js";

const ORDER_ID_FIELDS = ["Order ID", "order_id", "Shiprocket Order Id", "shiprocket_order_id"];
const STATUS_FIELDS = ["Status", "Current Status", "status", "current_status"];
const CHANNEL_FIELDS = ["Channel", "channel"];

const pickField = (row, names) => {
  for (const name of names) {
    const value = row[name];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

// Buffer-based parse — used by the admin upload endpoint, which gets the
// file in memory (express-fileupload) rather than as a path on disk.
export const parseCsvBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

/**
 * Core reconciliation pass — DB-only, no file I/O, so it's directly
 * unit-testable against an in-memory/mock DB.
 *
 * @param {object} params
 * @param {Array<object>} params.rows - raw CSV rows (header-keyed objects)
 * @param {boolean} [params.apply] - false (default) = dry run, zero writes
 * @param {ReturnType<typeof createLogger>} [params.logger]
 */
export const reconcileShiprocketOrderStatus = async ({ rows, apply = false, logger = createLogger() }) => {
  const counters = {
    total_rows: 0,
    skipped_missing_fields: 0,
    unsupported_status: 0,
    package_matched_updated: 0,
    package_matched_noop: 0,
    order_matched_updated: 0,
    order_matched_noop: 0,
    order_matched_blocked: 0,
    unmatched: 0,
  };
  const applied = [];
  const blocked = [];
  const unmatched = [];

  for (const row of rows) {
    counters.total_rows += 1;
    const shiprocketOrderId = pickField(row, ORDER_ID_FIELDS);
    const rawStatus = pickField(row, STATUS_FIELDS);
    const channel = pickField(row, CHANNEL_FIELDS);
    if (!shiprocketOrderId || !rawStatus) {
      counters.skipped_missing_fields += 1;
      continue;
    }

    const mappedStatus = normalizeOrderStatus(rawStatus);
    if (!mappedStatus) {
      counters.unsupported_status += 1;
      logger.warn(`Unsupported status "${rawStatus}" for Shiprocket order ${shiprocketOrderId}, skipped`);
      continue;
    }

    // ── Package-level match (current, post-multi-package-fulfillment orders) ──
    // reference_id (our own "<Order.id>-P<n>") first — see the header
    // comment for why that's what this column actually contains; the
    // Shiprocket-internal shiprocket_order_id is only a fallback.
    const pkg = (await Package.findOne({ reference_id: shiprocketOrderId }))
      || (await Package.findOne({ shiprocket_order_id: shiprocketOrderId }));
    if (pkg) {
      const packageStatus = PACKAGE_STATUS_MAP[mappedStatus];
      if (!packageStatus || !isForwardPackageTransition(pkg.status, packageStatus)) {
        counters.package_matched_noop += 1;
        continue;
      }
      counters.package_matched_updated += 1;
      applied.push({
        type: "package", shiprocket_order_id: shiprocketOrderId, package_id: String(pkg._id),
        order_id: String(pkg.order_id), from: pkg.status, to: packageStatus,
      });
      if (apply) {
        const now = new Date();
        const set = { status: packageStatus };
        if (packageStatus === "shipped" && !pkg.shipped_at) set.shipped_at = now;
        if (packageStatus === "delivered" && !pkg.delivered_at) set.delivered_at = now;
        await Package.updateOne(
          { _id: pkg._id },
          { $set: set, $push: { timeline: {
            status: packageStatus, occurred_at: now,
            raw: { source: "shiprocket_export_reconciliation", raw_status: rawStatus, channel },
          } } },
        );
        await recomputeOrderStatus({ orderId: pkg.order_id, source: "reconciliation" });
      }
      continue;
    }

    // ── Legacy order-level match (pre-Package-model orders) ──
    // Order.id (our own human id) first — a pre-Package-model order's
    // channel order id was simply its own id, no "-P<n>" suffix; the
    // legacy Order.shiprocket_order_id field is only a fallback.
    const order = (await Order.findOne({ id: shiprocketOrderId, deleted_at: null }))
      || (await Order.findOne({ shiprocket_order_id: shiprocketOrderId, deleted_at: null }));
    if (order) {
      const currentRank = STATUS_RANK[order.order_status] ?? -1;
      const targetRank = STATUS_RANK[mappedStatus] ?? -1;
      if (order.order_status === mappedStatus || targetRank <= currentRank) {
        counters.order_matched_noop += 1;
        continue;
      }
      if (apply) {
        try {
          await applyManualOrderStatusChange({
            order, status: mappedStatus, changedBy: null,
            reason: `Reconciled from Shiprocket export (channel: ${channel || "unknown"}, Shiprocket status: "${rawStatus}")`,
          });
          counters.order_matched_updated += 1;
          applied.push({
            type: "order", shiprocket_order_id: shiprocketOrderId, order_id: order.id,
            from: order.order_status, to: mappedStatus,
          });
        } catch (error) {
          counters.order_matched_blocked += 1;
          blocked.push({ shiprocket_order_id: shiprocketOrderId, order_id: order.id, reason: error?.message || String(error) });
          logger.warn(`Order ${order.id}: reconciliation blocked — ${error?.message || error}`);
        }
      } else {
        // Dry run: report intent without calling the mutating helper.
        counters.order_matched_updated += 1;
        applied.push({
          type: "order", shiprocket_order_id: shiprocketOrderId, order_id: order.id,
          from: order.order_status, to: mappedStatus,
        });
      }
      continue;
    }

    counters.unmatched += 1;
    unmatched.push({ shiprocket_order_id: shiprocketOrderId, status: rawStatus, channel });
  }

  if (!apply && counters.order_matched_updated > 0) {
    logger.warn(
      `Dry run: ${counters.order_matched_updated} order-level update(s) shown above are an upper bound — ` +
      "eligibility guards inside applyManualOrderStatusChange (cancellation/return/refund effects, unpaid Razorpay/partial-COD balance) " +
      "are only evaluated on the real --apply/apply run, so a few of these may still be skipped and reported as blocked instead.",
    );
  }

  return { apply, counters, applied, blocked, unmatched };
};
