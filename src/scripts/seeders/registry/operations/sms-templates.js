// Thin registry adapter over the shared services/smsTemplate/seedRunner.js
// handler — mirrors operations/email-templates.js. No business logic is
// duplicated here.
import SmsTemplate from "../../../../models/SmsTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../../../constants/smsTemplateDefaults.js";
import { runSeedSmsTemplates } from "../../../../services/smsTemplate/seedRunner.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  if (context.dryRun) {
    const events = Object.keys(TEMPLATES);
    const existing = await SmsTemplate.find({ event: { $in: events } }).select("event").lean();
    const existingSet = new Set(existing.map((doc) => doc.event));
    const missing = events.filter((event) => !existingSet.has(event));
    context.logger.info(`Dry run: ${missing.length} of ${events.length} template(s) missing and would be created.`);
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: events.length - missing.length, wouldDelete: 0 };
  }

  const { logs, summary } = await runSeedSmsTemplates();
  for (const line of logs) context.logger[line.level === "ERROR" ? "error" : line.level === "WARN" ? "warn" : "info"](line.message);
  return { inserted: summary.created, updated: 0, skipped: summary.skipped, deleted: 0, warnings: [] };
};

const healthCheck = async () => {
  const expected = Object.keys(TEMPLATES).length;
  const actual = await SmsTemplate.countDocuments({ event: { $in: Object.keys(TEMPLATES) } });
  return {
    status: actual >= expected ? "HEALTHY" : "DEGRADED",
    expected,
    actual,
    detail: `${actual}/${expected} default SMS template event(s) present (template_version target: ${TEMPLATE_DEFAULTS_VERSION}).`,
  };
};

export default {
  key: "sms-templates",
  name: "Seed SMS Templates",
  description: "Creates any missing default DLT-approved SMS template (never overwrites an existing/customized row).",
  type: "SEEDER",
  category: "notifications",
  version: TEMPLATE_DEFAULTS_VERSION,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: `Upserts up to ${Object.keys(TEMPLATES).length} SmsTemplate row(s) via $setOnInsert only.`,
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
