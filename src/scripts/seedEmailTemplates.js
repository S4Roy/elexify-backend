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

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import EmailTemplate from "../models/EmailTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../constants/emailTemplateDefaults.js";

const LANGUAGE = "en";

export { TEMPLATES, TEMPLATE_DEFAULTS_VERSION };

const run = async () => {
  await mongooseConnection;

  const ops = Object.entries(TEMPLATES).map(
    ([action, { subject, preheader, body, required_variables, is_marketing }]) => ({
      updateOne: {
        filter: { action, site_language: LANGUAGE },
        update: {
          $setOnInsert: {
            action,
            site_language: LANGUAGE,
            subject,
            preheader: preheader || "",
            body,
            required_variables: required_variables || [],
            is_marketing: Boolean(is_marketing),
            template_version: TEMPLATE_DEFAULTS_VERSION,
            status: "active",
            created_at: new Date(),
          },
        },
        upsert: true,
      },
    })
  );

  const result = await EmailTemplate.bulkWrite(ops, { ordered: false });
  console.log(
    `Email templates seeded: ${result.upsertedCount} created, ${ops.length - result.upsertedCount} already existed (untouched).`
  );

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
