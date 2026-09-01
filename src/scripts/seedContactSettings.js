/**
 * Fixes the contact_mobile / contact_email / contact_address site settings
 * (they held unrelated placeholder values left over from testing) and adds
 * business_hours, so the Contact Us page shows Elexify's real contact
 * details. Idempotent — upserts by slug. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/seedContactSettings.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import SiteSetting from "../models/SiteSetting.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const settings = [
  {
    slug: "contact_mobile",
    label: "Contact Mobile",
    type: "text",
    value: "+91 9110976419",
  },
  {
    slug: "contact_email",
    label: "Contact Email",
    type: "text",
    value: "support@elexify.online",
  },
  {
    slug: "contact_address",
    label: "Contact Address",
    type: "text",
    value: "57, T.N. Banerjee Road, Panihati, Kolkata - 700114, West Bengal, India",
  },
  {
    slug: "business_hours",
    label: "Business Hours",
    type: "text",
    value: "Call us: 10 AM - 6 PM",
  },
];

// Registered as a REQUIRED_BOOTSTRAP data-op (see
// seeders/registry/operations/contact-settings.js) — that requires
// idempotent: true, so this now uses $setOnInsert like every other
// bootstrap seeder, never overwriting a value an admin has since edited on
// the Settings page. (Originally used $set, unconditionally overwriting on
// every run — fixed as part of the data-operations migration.)
export const runSeedContactSettings = async ({ logger = createLogger() } = {}) => {
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
      logger.info(`Created setting: ${setting.slug} = ${setting.value}`);
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
    const { logs } = await runSeedContactSettings();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
