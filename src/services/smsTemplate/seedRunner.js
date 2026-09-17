// Shared logic behind both the CLI seed script and the data-operations
// registry entry (scripts/seeders/registry/operations/sms-templates.js).
// Mirrors services/emailTemplate/seedRunner.js.

import SmsTemplate from "../../models/SmsTemplate.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../constants/smsTemplateDefaults.js";

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

// Idempotent: creates any `event` row that doesn't exist yet via
// $setOnInsert. Never touches an existing row, customized or not.
export const runSeedSmsTemplates = async () => {
  const logger = makeLogger();
  logger.info(`Starting seed run for ${Object.keys(TEMPLATES).length} SMS template event(s).`);

  const ops = Object.entries(TEMPLATES).map(
    ([event, { category, message, variables, dlt_message_id, sender_id, is_unicode }]) => ({
      updateOne: {
        filter: { event },
        update: {
          $setOnInsert: {
            event,
            category: category || "transactional",
            message,
            variables: variables || [],
            dlt_message_id,
            sender_id: sender_id || null,
            is_unicode: Boolean(is_unicode),
            template_version: TEMPLATE_DEFAULTS_VERSION,
            status: "active",
            created_at: new Date(),
          },
        },
        upsert: true,
      },
    })
  );

  const result = await SmsTemplate.bulkWrite(ops, { ordered: false });
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
