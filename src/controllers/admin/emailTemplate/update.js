import EmailTemplate from "../../../models/EmailTemplate.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";

// Only presentation fields are admin-editable — `action`/`site_language`
// (the upsert key) and `required_variables` (the data contract the render
// pipeline enforces) stay code-controlled, so an edit can never silently
// break the notification queue's fail-safe behavior.
export const update = async (req, res, next) => {
  try {
    const { action } = req.params;
    const { subject, preheader, body, status } = req.body;
    const admin_id = req.auth?.user_id;

    const template = await EmailTemplate.findOne({ action, site_language: "en" });
    if (!template) throw StatusError.notFound(req.__("Email template not found"));

    template.subject = subject;
    template.preheader = preheader || "";
    template.body = body;
    if (status) template.status = status;
    template.updated_by = admin_id;
    template.updated_at = new Date();
    await template.save();

    await auditService.recordAudit({
      userId: admin_id,
      event: "EMAIL_TEMPLATE_UPDATED",
      req,
      actorId: admin_id,
      metadata: { action },
    });

    res.status(200).json({
      status: "success",
      message: req.__("Email template updated successfully"),
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
