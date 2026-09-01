// Thin registry adapter over services/emailTemplate/seedRunner.js's
// runUpgradeEmailTemplatesToV2 — see email-templates.js for the seed half.
import EmailTemplate from "../../../../models/EmailTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../../../constants/emailTemplateDefaults.js";
import { runUpgradeEmailTemplatesToV2 } from "../../../../services/emailTemplate/seedRunner.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const LANGUAGE = "en";

const handler = async (context) => {
  if (context.dryRun) {
    const candidates = await EmailTemplate.countDocuments({
      action: { $in: Object.keys(TEMPLATES) },
      site_language: LANGUAGE,
      $or: [{ template_version: { $exists: false } }, { template_version: { $lt: TEMPLATE_DEFAULTS_VERSION } }],
    });
    context.logger.info(`Dry run: ${candidates} template(s) below v${TEMPLATE_DEFAULTS_VERSION} would be overwritten with current defaults.`);
    return { wouldInsert: 0, wouldUpdate: candidates, wouldSkip: Object.keys(TEMPLATES).length - candidates, wouldDelete: 0 };
  }

  const { logs, summary } = await runUpgradeEmailTemplatesToV2();
  for (const line of logs) context.logger[line.level === "ERROR" ? "error" : line.level === "WARN" ? "warn" : "info"](line.message);
  return { inserted: 0, updated: summary.upgraded, skipped: summary.skipped, deleted: 0, warnings: [] };
};

export default {
  key: "email-templates-upgrade",
  name: "Upgrade Email Templates to v2",
  description: "One-time overwrite of any email template still below template_version 2 with the current redesigned defaults. Rows already customized past v2, or missing entirely, are left alone.",
  type: "MIGRATION",
  category: "notifications",
  version: TEMPLATE_DEFAULTS_VERSION,
  required: false,
  idempotent: true, // safe to re-run: a second run finds nothing left below the target version
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: ["email-templates"],
  estimatedImpact: "Overwrites subject/preheader/body/required_variables/is_marketing on template rows still below the current version.",
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
