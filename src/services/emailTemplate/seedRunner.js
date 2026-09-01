// Shared logic behind both `node src/scripts/seedEmailTemplates.js` /
// `upgradeEmailTemplatesToV2.js` and the admin "Run Seed" panel
// (controllers/admin/emailTemplate/seedRun.js). Kept DB-connection-free so
// it can run inside an already-connected request lifecycle (admin trigger)
// or a standalone script (CLI, which owns its own mongooseConnection).
//
// Every run returns a structured, timestamped log — the same log lines are
// printed to the console (by the CLI wrappers) and returned as JSON (by the
// admin endpoint) so both surfaces show identical, industry-standard
// leveled output instead of ad-hoc strings.

import EmailTemplate from "../../models/EmailTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../constants/emailTemplateDefaults.js";

const LANGUAGE = "en";

const makeLogger = () => {
  const logs = [];
  const push = (level, message) => {
    logs.push({ level, message, timestamp: new Date().toISOString() });
  };
  return {
    logs,
    info: (message) => push("INFO", message),
    warn: (message) => push("WARN", message),
    error: (message) => push("ERROR", message),
  };
};

// Idempotent: creates any (action, site_language) row that doesn't exist
// yet via $setOnInsert. Never touches an existing row, customized or not.
export const runSeedEmailTemplates = async () => {
  const logger = makeLogger();
  logger.info(`Starting seed run for ${Object.keys(TEMPLATES).length} template action(s), language="${LANGUAGE}".`);

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
  const created = result.upsertedCount;
  const skipped = ops.length - created;

  if (created > 0) logger.info(`Created ${created} missing template(s).`);
  else logger.info("No missing templates — nothing created.");
  logger.info(`${skipped} template(s) already existed and were left untouched.`);
  logger.info("Seed run complete.");

  return {
    logs: logger.logs,
    summary: { total: ops.length, created, skipped },
  };
};

// One-time-per-environment migration: overwrites subject/preheader/body/
// required_variables/is_marketing with the current defaults, but only for
// rows still below TEMPLATE_DEFAULTS_VERSION (i.e. never customized past
// the original seed). Rows already current, or missing entirely, are left
// alone (missing rows are created by runSeedEmailTemplates instead).
export const runUpgradeEmailTemplatesToV2 = async () => {
  const logger = makeLogger();
  logger.info(`Starting upgrade run to template_version=${TEMPLATE_DEFAULTS_VERSION} for ${Object.keys(TEMPLATES).length} template action(s).`);

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
    if (result.matchedCount > 0) {
      upgraded += 1;
      logger.info(`Upgraded "${action}" to v${TEMPLATE_DEFAULTS_VERSION}.`);
    } else {
      skipped += 1;
    }
  }

  logger.info(`${skipped} template(s) skipped (already current, customized past v2, or missing).`);
  logger.info("Upgrade run complete.");

  return {
    logs: logger.logs,
    summary: { total: Object.keys(TEMPLATES).length, upgraded, skipped },
  };
};
