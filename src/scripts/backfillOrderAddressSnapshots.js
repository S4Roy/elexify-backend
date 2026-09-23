/**
 * One-time backfill: repairs Order.billing_address_snapshot /
 * shipping_address_snapshot documents whose `state` came out null.
 *
 * Context: snapshotAddress() used to build these snapshots purely from an
 * Address document's denormalized *_name fields (address.state_name, etc).
 * Self-service address creation/editing (controllers/user/address/add.js,
 * edit.js) never populated state_name/city_name/country_name, so every
 * order placed against a self-service address got a snapshot with
 * `state: null` baked in permanently. resolveCustomerAddress.js then can't
 * derive a state_code from that snapshot, so Zoho contact/invoice sync
 * silently omits place_of_contact — and Zoho Books defaults "State of
 * Supply" to the organization's own home state instead of the customer's.
 *
 * snapshotAddress() and the address controllers were fixed to stop this
 * going forward; this script repairs the snapshots already stored on
 * existing orders by re-deriving them from the referenced Address's live
 * numeric city/state/country IDs (same lookup snapshotAddress() now does).
 *
 * Usage:
 *   node src/scripts/backfillOrderAddressSnapshots.js            # dry run
 *   node src/scripts/backfillOrderAddressSnapshots.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Order from "../models/Order.js";
import Address from "../models/Address.js";
import { snapshotAddress } from "../services/invoiceService/snapshotAddress.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const BROKEN_SNAPSHOT_FILTER = {
  deleted_at: null,
  $or: [
    { billing_address_snapshot: { $ne: null }, "billing_address_snapshot.state": null },
    { shipping_address_snapshot: { $ne: null }, "shipping_address_snapshot.state": null },
  ],
};

export const runBackfillOrderAddressSnapshots = async ({ apply = false, logger = createLogger() } = {}) => {
  const candidates = await Order.find(BROKEN_SNAPSHOT_FILTER)
    .select("_id id billing_address billing_address_snapshot shipping_address shipping_address_snapshot")
    .lean();

  logger.info(`Checked ${candidates.length} order(s) with a snapshot missing state.`);
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes");

  let fixed = 0;
  let skipped = 0;
  for (const order of candidates) {
    const update = {};
    for (const [snapshotField, refField] of [
      ["billing_address_snapshot", "billing_address"],
      ["shipping_address_snapshot", "shipping_address"],
    ]) {
      const snapshot = order[snapshotField];
      if (!snapshot || snapshot.state || !order[refField]) continue;
      const address = await Address.findById(order[refField]).lean();
      if (!address) continue;
      const repaired = await snapshotAddress(address);
      if (repaired?.state) update[snapshotField] = { ...snapshot, ...repaired };
    }
    if (!Object.keys(update).length) {
      skipped++;
      continue;
    }
    logger.info(`${apply ? "FIX" : "Would fix"} order ${order.id} (${Object.keys(update).join(", ")})`);
    if (apply) await Order.updateOne({ _id: order._id }, { $set: update });
    fixed++;
  }

  logger.info(`${apply ? "Fixed" : "Would fix"} ${fixed} order(s); ${skipped} could not be resolved (address missing or still unresolvable).`);

  return {
    logs: logger.logs,
    summary: { checked: candidates.length, fixed, skipped, applied: apply },
    result: apply
      ? buildResult({ updated: fixed, skipped })
      : buildResult({ warnings: [`Dry run: would fix ${fixed} order(s); ${skipped} would remain unresolved`] }),
    dryRunPreview: !apply
      ? { wouldInsert: 0, wouldUpdate: fixed, wouldSkip: skipped, wouldDelete: 0 }
      : null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = process.argv.includes("--apply");
    const { logs } = await runBackfillOrderAddressSnapshots({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
