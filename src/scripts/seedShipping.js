/**
 * Seeds a minimal default shipping configuration so checkout works out of
 * the box before an admin has configured anything: one "Standard" shipping
 * class, one all-India default zone, and one flat-rate default rate. Safe
 * to re-run — it's a no-op once a default zone already exists.
 *
 * Usage:
 *   node src/scripts/seedShipping.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import ShippingClass from "../models/ShippingClass.js";
import ShippingZone from "../models/ShippingZone.js";
import ShippingRate from "../models/ShippingRate.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runSeedShipping = async ({ logger = createLogger() } = {}) => {
  const existingDefaultZone = await ShippingZone.findOne({ is_default: true });
  if (existingDefaultZone) {
    logger.info("A default shipping zone already exists — nothing to seed.");
    return { logs: logger.logs, summary: { created: 0, skipped: 1 }, result: buildResult({ skipped: 1 }) };
  }

  let created = 0;
  let standardClass = await ShippingClass.findOne({ slug: "standard" });
  if (!standardClass) {
    standardClass = await ShippingClass.create({
      name: "Standard",
      slug: "standard",
      description: "Default shipping class for regular products",
      is_default: true,
      status: "active",
    });
    created += 1;
    logger.info("Created default Shipping Class: Standard");
  }

  const zone = await ShippingZone.create({
    name: "All India",
    countries: [101],
    states: [],
    pincode_prefixes: [],
    is_default: true,
    status: "active",
  });
  created += 1;
  logger.info("Created default Shipping Zone: All India");

  await ShippingRate.create({
    zone: zone._id,
    shipping_class: null,
    flat_rate: 50,
    per_kg_rate: 20,
    free_weight_kg: 0.5,
    free_shipping_min_order_value: 999,
    min_delivery_days: 3,
    max_delivery_days: 6,
    status: "active",
  });
  created += 1;
  logger.info("Created default Shipping Rate for All India zone.");

  return { logs: logger.logs, summary: { created, skipped: 0 }, result: buildResult({ inserted: created }) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runSeedShipping();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
