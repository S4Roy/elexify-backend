// Bootstraps "India only" checkout: sets every Country except India to
// inactive. The storefront's country dropdown (site/common/countries) and
// address validation already only allow `status: "active"` countries, so
// this alone is enough — an admin can re-enable others later from
// Settings > Countries in the admin panel, no code change needed.
//
// Usage: node src/scripts/restrictCountriesToIndia.js

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Country from "../models/Country.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const INDIA_ID = 101;

export const runRestrictCountriesToIndia = async ({ logger = createLogger() } = {}) => {
  const result = await Country.updateMany(
    { id: { $ne: INDIA_ID } },
    { $set: { status: "inactive" } },
  );
  await Country.updateOne({ id: INDIA_ID }, { $set: { status: "active" } });

  const active = await Country.countDocuments({ status: "active" });
  logger.info(`Deactivated ${result.modifiedCount} countries. Active countries now: ${active}.`);

  return {
    logs: logger.logs,
    summary: { deactivated: result.modifiedCount, activeCount: active },
    result: buildResult({ updated: result.modifiedCount }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runRestrictCountriesToIndia();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
