/**
 * Seeds the `gtm_container_id` site setting so an admin can wire up Google
 * Tag Manager (and, through it, GA4 e-commerce tracking) from the Settings
 * page without a code change or redeploy. Left blank by default — the
 * storefront simply doesn't load GTM until an admin fills it in.
 * Idempotent — upserts by slug via $setOnInsert. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/seedAnalyticsSettings.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import SiteSetting from "../models/SiteSetting.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const settings = [
  {
    slug: "gtm_container_id",
    label: "Google Tag Manager Container ID (e.g. GTM-XXXXXXX)",
    type: "analytics",
    value: "",
  },
];

export const runSeedAnalyticsSettings = async ({ logger = createLogger() } = {}) => {
  let created = 0;
  let skipped = 0;

  for (const setting of settings) {
    const result = await SiteSetting.updateOne(
      { slug: setting.slug },
      { $setOnInsert: { ...setting, updated_at: new Date() } },
      { upsert: true },
    );
    const wasCreated = result.upsertedCount || result.upserted?.length;
    if (wasCreated) {
      created += 1;
      logger.info(`Created setting: ${setting.slug}`);
    } else {
      skipped += 1;
      logger.info(`Already exists, left untouched: ${setting.slug}`);
    }
  }

  return { logs: logger.logs, summary: { total: settings.length, created, skipped }, result: buildResult({ inserted: created, skipped }) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runSeedAnalyticsSettings();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
