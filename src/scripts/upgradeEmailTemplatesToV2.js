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
// explicit, confirmed overwrite for one template at a time.
//
// Usage: node src/scripts/upgradeEmailTemplatesToV2.js

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import EmailTemplate from "../models/EmailTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../constants/emailTemplateDefaults.js";

const LANGUAGE = "en";

const run = async () => {
  await mongooseConnection;

  let upgraded = 0;
  let skipped = 0;

  for (const [action, { subject, preheader, body, required_variables, is_marketing }] of Object.entries(TEMPLATES)) {
    const result = await EmailTemplate.updateOne(
      {
        action,
        site_language: LANGUAGE,
        $or: [{ template_version: { $exists: false } }, { template_version: { $lt: TEMPLATE_DEFAULTS_VERSION } }],
      },
      {
        $set: {
          subject,
          preheader: preheader || "",
          body,
          required_variables: required_variables || [],
          is_marketing: Boolean(is_marketing),
          template_version: TEMPLATE_DEFAULTS_VERSION,
          updated_at: new Date(),
        },
      }
    );
    if (result.matchedCount > 0) upgraded += 1;
    else skipped += 1;
  }

  console.log(`Email templates upgraded to v${TEMPLATE_DEFAULTS_VERSION}: ${upgraded}, skipped (already current or missing): ${skipped}.`);

  await mongoose.disconnect();
  process.exit(0);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
