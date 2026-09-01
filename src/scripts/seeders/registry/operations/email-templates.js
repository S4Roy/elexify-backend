// Thin registry adapter over the existing, already-shared
// services/emailTemplate/seedRunner.js handler (also used by
// controllers/admin/emailTemplate/seedRun.js and
// scripts/seedEmailTemplates.js) — no business logic is duplicated here.
import EmailTemplate from "../../../../models/EmailTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../../../constants/emailTemplateDefaults.js";
import { runSeedEmailTemplates } from "../../../../services/emailTemplate/seedRunner.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const LANGUAGE = "en";

const handler = async (context) => {
  if (context.dryRun) {
    const actions = Object.keys(TEMPLATES);
    const existing = await EmailTemplate.find({ action: { $in: actions }, site_language: LANGUAGE })
      .select("action")
      .lean();
    const existingSet = new Set(existing.map((doc) => doc.action));
    const missing = actions.filter((action) => !existingSet.has(action));
    context.logger.info(`Dry run: ${missing.length} of ${actions.length} template(s) missing and would be created.`);
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: actions.length - missing.length, wouldDelete: 0 };
  }

  const { logs, summary } = await runSeedEmailTemplates();
  for (const line of logs) context.logger[line.level === "ERROR" ? "error" : line.level === "WARN" ? "warn" : "info"](line.message);
  return { inserted: summary.created, updated: 0, skipped: summary.skipped, deleted: 0, warnings: [] };
};

const healthCheck = async () => {
  const expected = Object.keys(TEMPLATES).length;
  const actual = await EmailTemplate.countDocuments({
    action: { $in: Object.keys(TEMPLATES) },
    site_language: LANGUAGE,
  });
  return {
    status: actual >= expected ? "HEALTHY" : "DEGRADED",
    expected,
    actual,
    detail: `${actual}/${expected} default email template action(s) present for language="${LANGUAGE}" (template_version target: ${TEMPLATE_DEFAULTS_VERSION}).`,
  };
};

export default {
  key: "email-templates",
  name: "Seed Email Templates",
  description: "Creates any missing default transactional email template (never overwrites an existing/customized row).",
  type: "SEEDER",
  category: "notifications",
  version: TEMPLATE_DEFAULTS_VERSION,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: `Upserts up to ${Object.keys(TEMPLATES).length} EmailTemplate row(s) via $setOnInsert only.`,
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
