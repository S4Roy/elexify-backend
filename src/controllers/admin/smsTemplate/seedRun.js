import { StatusError } from "../../../config/index.js";
import { runSeedSmsTemplates } from "../../../services/smsTemplate/seedRunner.js";
import { auditService } from "../../../services/index.js";

// Lets an admin run the same seed logic as the data-operations registry
// entry (sms-templates) directly from the SMS Templates screen, and see
// the structured run log inline instead of needing shell/admin-ops access.
export const seedRun = async (req, res, next) => {
  try {
    const { type } = req.body;
    const admin_id = req.auth?.user_id;

    if (type !== "seed") throw StatusError.badRequest(req.__("Unknown seed run type"));

    const { logs, summary } = await runSeedSmsTemplates();

    await auditService.recordAudit({
      userId: admin_id,
      event: "SMS_TEMPLATE_SEED_RUN",
      req,
      actorId: admin_id,
      metadata: { type, summary },
    });

    res.status(200).json({
      status: "success",
      message: req.__("Seed run complete"),
      data: { type, logs, summary },
    });
  } catch (error) {
    next(error);
  }
};
