// One-time, explicit migration for the transactional-email design
// modernization pass. Unlike seedEmailTemplates.js (which only ever
// $setOnInsert's — protecting any admin-customized row forever),
// this OVERWRITES a row's subject/preheader/body/required_variables/
// is_marketing with the new v2 defaults — but ONLY for rows that are
// still at template_version < 2 (i.e. never customized past the original
// seed). Any row already at version >= 2, or missing entirely, is left
// alone (missing rows are created by the regular seed script instead, not
// this one).
//
// This is intentionally a separate, manually-run script (not part of
// server startup or the idempotent seeder) — run it once per environment
// that already had the pre-redesign plain-text defaults seeded. Going
// forward, an admin can also re-apply a single template's default via the
// admin "Reset to Default" action, which performs the same kind of
// explicit, confirmed overwrite for one template at a time — or run this
// same migration for every template at once from the admin panel's "Run
// Seed" action (controllers/admin/emailTemplate/seedRun.js).
//
// Usage: node src/scripts/upgradeEmailTemplatesToV2.js

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { runUpgradeEmailTemplatesToV2 } from "../services/emailTemplate/seedRunner.js";
import { printRunLog } from "./_printRunLog.js";

const run = async () => {
  await mongooseConnection;

  const { logs, summary } = await runUpgradeEmailTemplatesToV2();
  printRunLog("upgrade:email-templates-v2", logs, summary);

  await mongoose.disconnect();
  process.exit(0);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
