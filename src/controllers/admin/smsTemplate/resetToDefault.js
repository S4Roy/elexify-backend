import SmsTemplate from "../../../models/SmsTemplate.js";
import { StatusError } from "../../../config/index.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../../constants/smsTemplateDefaults.js";
import { auditService } from "../../../services/index.js";

// Re-applies the code-owned default (message/variables/dlt_message_id) for
// one event. Requires an explicit `confirm: true` — the only way an
// admin's customization can be discarded, always audited.
export const resetToDefault = async (req, res, next) => {
  try {
    const { event } = req.params;
    const { confirm } = req.body;
    const admin_id = req.auth?.user_id;

    if (confirm !== true) {
      throw StatusError.badRequest(req.__("Confirmation is required to reset a template to its default content"));
    }

    const defaults = TEMPLATES[event];
    if (!defaults) throw StatusError.notFound(req.__("No default content exists for this template"));

    const template = await SmsTemplate.findOneAndUpdate(
      { event },
      {
        $set: {
          category: defaults.category || "transactional",
          message: defaults.message,
          variables: defaults.variables || [],
          dlt_message_id: defaults.dlt_message_id,
          sender_id: defaults.sender_id || null,
          is_unicode: Boolean(defaults.is_unicode),
          template_version: TEMPLATE_DEFAULTS_VERSION,
          status: "active",
          updated_by: admin_id,
          updated_at: new Date(),
        },
      },
      { new: true }
    );
    if (!template) throw StatusError.notFound(req.__("SMS template not found"));

    await auditService.recordAudit({
      userId: admin_id,
      event: "SMS_TEMPLATE_RESET",
      req,
      actorId: admin_id,
      metadata: { event },
    });

    res.status(200).json({
      status: "success",
      message: req.__("SMS template reset to default"),
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
