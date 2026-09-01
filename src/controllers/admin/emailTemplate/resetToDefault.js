import EmailTemplate from "../../../models/EmailTemplate.js";
import { StatusError } from "../../../config/index.js";
import { TEMPLATES, TEMPLATE_DEFAULTS_VERSION } from "../../../constants/emailTemplateDefaults.js";
import { auditService } from "../../../services/index.js";

// Re-applies the code-owned default copy for one template. Requires an
// explicit `confirm: true` in the body (the client-side confirmation
// dialog sets this) — this is the only way an admin's customization can be
// discarded, and it's always audited.
export const resetToDefault = async (req, res, next) => {
  try {
    const { action } = req.params;
    const { confirm } = req.body;
    const admin_id = req.auth?.user_id;

    if (confirm !== true) {
      throw StatusError.badRequest(req.__("Confirmation is required to reset a template to its default content"));
    }

    const defaults = TEMPLATES[action];
    if (!defaults) throw StatusError.notFound(req.__("No default content exists for this template"));

    const template = await EmailTemplate.findOneAndUpdate(
      { action, site_language: "en" },
      {
        $set: {
          subject: defaults.subject,
          preheader: defaults.preheader || "",
          body: defaults.body,
          required_variables: defaults.required_variables || [],
          is_marketing: Boolean(defaults.is_marketing),
          template_version: TEMPLATE_DEFAULTS_VERSION,
          status: "active",
          updated_by: admin_id,
          updated_at: new Date(),
        },
      },
      { new: true }
    );
    if (!template) throw StatusError.notFound(req.__("Email template not found"));

    await auditService.recordAudit({
      userId: admin_id,
      event: "EMAIL_TEMPLATE_RESET",
      req,
      actorId: admin_id,
      metadata: { action },
    });

    res.status(200).json({
      status: "success",
      message: req.__("Email template reset to default"),
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
