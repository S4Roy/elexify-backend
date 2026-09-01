// Bootstraps the `email_templates` collection so notification delivery
// actually works out of the box in a fresh environment (previously: zero
// templates existed and every send silently failed — see
// services/emailTemplate/getTemplate.js + models/EmailTemplate.js).
//
// Safe to re-run: upserts by (action, site_language) using $setOnInsert
// only — an existing row (including one an admin has since customized) is
// never touched.
//
// Usage: node src/scripts/seedEmailTemplates.js
//
// Same run logic backs the admin panel's "Run Seed" action
// (controllers/admin/emailTemplate/seedRun.js) — see
// services/emailTemplate/seedRunner.js.

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../constants/emailTemplateDefaults.js";
import { runSeedEmailTemplates } from "../services/emailTemplate/seedRunner.js";
import { printRunLog } from "./_printRunLog.js";

export { TEMPLATES, TEMPLATE_DEFAULTS_VERSION };

const run = async () => {
  await mongooseConnection;

  const { logs, summary } = await runSeedEmailTemplates();
  printRunLog("seed:email-templates", logs, summary);

  await mongoose.disconnect();
  process.exit(0);
};

// Guarded so tests can `import { TEMPLATES }` without also triggering a
// live Mongo connection + process.exit as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
