/**
 * One-time repair: converts legacy (WooCommerce-era) address locations into
 * catalog ids.
 *
 * Context: addresses imported from the old store carry `country: "IN"`,
 * `state: "WB"` and `city: "Birpara"` in fields the Address schema types as
 * numeric catalog ids, with no *_name fields. Any Mongoose query that feeds
 * those values into a numeric `id` filter throws a CastError (e.g. the admin
 * customer address list: `Cast to Number failed for value "IN"`), and the
 * $lookup-based order/address views silently show no location at all.
 *
 * For every such address this script sets numeric country/state/city ids plus
 * country_name/state_name/city_name, and keeps the original values in
 * `legacy_location`. It also rewrites order address snapshots that stored the
 * ISO country code / state code ("IN" / "WB") as display names, which Zoho
 * state_code resolution needs.
 *
 * Usage:
 *   node src/scripts/normalizeLegacyAddressLocations.js            # dry run
 *   node src/scripts/normalizeLegacyAddressLocations.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Address from "../models/Address.js";
import Order from "../models/Order.js";
import { resolveLocation } from "../services/location/resolveLocation.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const NOT_NUMBER = { $exists: true, $nin: [null], $not: { $type: "number" } };
const LEGACY_ADDRESS_FILTER = { $or: [{ country: NOT_NUMBER }, { state: NOT_NUMBER }, { city: NOT_NUMBER }] };
const LOCATION_CODE = /^[A-Z]{2,3}$/;
const LEGACY_SNAPSHOT_FILTER = {
  $or: ["billing_address_snapshot", "shipping_address_snapshot"].flatMap(field => [
    { [`${field}.country`]: LOCATION_CODE },
    { [`${field}.state`]: LOCATION_CODE },
  ]),
};

const normalizeAddresses = async ({ apply, logger }) => {
  // Raw collection read: Mongoose would try to cast the legacy strings.
  const candidates = await Address.collection.find(LEGACY_ADDRESS_FILTER)
    .project({ country: 1, state: 1, city: 1 }).toArray();
  logger.info(`Checked ${candidates.length} address(es) with non-numeric location values.`);

  let fixed = 0;
  const unresolved = [];
  const cache = new Map();
  for (const address of candidates) {
    const original = { country: address.country ?? null, state: address.state ?? null, city: address.city ?? null };
    const key = JSON.stringify(original);
    if (!cache.has(key)) cache.set(key, await resolveLocation(original));
    const location = cache.get(key);
    if (!location?.state) {
      unresolved.push(`${address._id} (${key})`);
      continue;
    }
    if (apply) {
      await Address.collection.updateOne({ _id: address._id }, { $set: { ...location, legacy_location: original } });
    }
    fixed++;
  }
  for (const entry of unresolved) logger.warn(`Unresolved address ${entry}`);
  logger.info(`${apply ? "Fixed" : "Would fix"} ${fixed} address(es); ${unresolved.length} unresolved.`);
  return { checked: candidates.length, fixed, unresolved: unresolved.length };
};

const normalizeSnapshots = async ({ apply, logger }) => {
  const candidates = await Order.find(LEGACY_SNAPSHOT_FILTER)
    .select("_id id billing_address_snapshot shipping_address_snapshot").lean();
  logger.info(`Checked ${candidates.length} order(s) with coded snapshot country/state.`);

  let fixed = 0;
  let skipped = 0;
  const cache = new Map();
  for (const order of candidates) {
    const update = {};
    for (const field of ["billing_address_snapshot", "shipping_address_snapshot"]) {
      const snapshot = order[field];
      if (!snapshot || !(LOCATION_CODE.test(snapshot.country || "") || LOCATION_CODE.test(snapshot.state || ""))) continue;
      const key = `${snapshot.country}|${snapshot.state}`;
      if (!cache.has(key)) cache.set(key, await resolveLocation({ country: snapshot.country, state: snapshot.state }));
      const location = cache.get(key);
      if (!location?.state_name) continue;
      update[`${field}.country`] = location.country_name;
      update[`${field}.state`] = location.state_name;
    }
    if (!Object.keys(update).length) {
      skipped++;
      continue;
    }
    if (apply) await Order.updateOne({ _id: order._id }, { $set: update });
    fixed++;
  }
  logger.info(`${apply ? "Fixed" : "Would fix"} ${fixed} order snapshot(s); ${skipped} unresolved.`);
  return { checked: candidates.length, fixed, skipped };
};

export const runNormalizeLegacyAddressLocations = async ({ apply = false, logger = createLogger() } = {}) => {
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes");
  const addresses = await normalizeAddresses({ apply, logger });
  const snapshots = await normalizeSnapshots({ apply, logger });
  const updated = addresses.fixed + snapshots.fixed;
  const skipped = addresses.unresolved + snapshots.skipped;

  return {
    logs: logger.logs,
    summary: { addresses, snapshots, applied: apply },
    result: apply
      ? buildResult({ updated, skipped })
      : buildResult({ warnings: [`Dry run: would fix ${addresses.fixed} address(es) and ${snapshots.fixed} order(s); ${skipped} would remain unresolved`] }),
    dryRunPreview: !apply
      ? { wouldInsert: 0, wouldUpdate: updated, wouldSkip: skipped, wouldDelete: 0 }
      : null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = process.argv.includes("--apply");
    const { logs } = await runNormalizeLegacyAddressLocations({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
