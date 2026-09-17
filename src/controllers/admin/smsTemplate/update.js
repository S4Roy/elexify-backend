import SmsTemplate from "../../../models/SmsTemplate.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";

// Unlike email templates, `message`/`variables`/`dlt_message_id` ARE the
// compliance-critical fields here (not just presentation) — Fast2SMS's
// "dlt" route sends by dlt_message_id, not the `message` text, so an admin
// changing the copy must also update dlt_message_id/variables to match
// whatever they've actually re-registered with the DLT entity, or the
// live SMS will silently keep sending the old approved text regardless of
// what this panel shows. `event` (the upsert key) stays code-controlled.
export const update = async (req, res, next) => {
  try {
    const { event } = req.params;
    const { category, message, variables, dlt_message_id, sender_id, is_unicode, status } = req.body;
    const admin_id = req.auth?.user_id;

    const template = await SmsTemplate.findOne({ event });
    if (!template) throw StatusError.notFound(req.__("SMS template not found"));

    template.category = category || template.category;
    template.message = message;
    template.variables = variables;
    template.dlt_message_id = dlt_message_id;
    template.sender_id = sender_id || null;
    template.is_unicode = Boolean(is_unicode);
    if (status) template.status = status;
    template.updated_by = admin_id;
    template.updated_at = new Date();
    await template.save();

    await auditService.recordAudit({
      userId: admin_id,
      event: "SMS_TEMPLATE_UPDATED",
      req,
      actorId: admin_id,
      metadata: { event },
    });

    res.status(200).json({
      status: "success",
      message: req.__("SMS template updated successfully"),
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
