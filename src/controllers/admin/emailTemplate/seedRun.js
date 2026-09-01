import { StatusError } from "../../../config/index.js";
import { runSeedEmailTemplates, runUpgradeEmailTemplatesToV2 } from "../../../services/emailTemplate/seedRunner.js";
import { auditService } from "../../../services/index.js";

const RUNNERS = {
  seed: runSeedEmailTemplates,
  upgrade: runUpgradeEmailTemplatesToV2,
};

// Lets an admin run the same seed/upgrade logic as the CLI scripts
// (scripts/seedEmailTemplates.js, scripts/upgradeEmailTemplatesToV2.js)
// on demand, from the Email Templates screen, and see the structured run
// log inline instead of needing shell access to the server.
export const seedRun = async (req, res, next) => {
  try {
    const { type } = req.body;
    const admin_id = req.auth?.user_id;

    const runner = RUNNERS[type];
    if (!runner) throw StatusError.badRequest(req.__("Unknown seed run type"));

    const { logs, summary } = await runner();

    await auditService.recordAudit({
      userId: admin_id,
      event: "EMAIL_TEMPLATE_SEED_RUN",
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
