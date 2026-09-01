import EmailTemplate from "../../../models/EmailTemplate.js";
import { StatusError } from "../../../config/index.js";
import { emailService, auditService } from "../../../services/index.js";
import { EMAIL_PREVIEW_FIXTURE } from "../../../constants/emailPreviewFixture.js";

// Sends a real email using only the safe sample fixture — never real
// customer/order data — and bypasses the notification job queue entirely
// (this is a direct admin action, not a business-event notification).
export const sendTest = async (req, res, next) => {
  try {
    const { action } = req.params;
    const { email } = req.body;
    const admin_id = req.auth?.user_id;

    const template = await EmailTemplate.findOne({ action, site_language: "en" }).lean();
    if (!template) throw StatusError.notFound(req.__("Email template not found"));

    const delivered = await emailService.sendEmail(email, action, undefined, "en", EMAIL_PREVIEW_FIXTURE);
    if (!delivered) {
      throw StatusError.badRequest(req.__("Test email could not be sent — check the template renders without unresolved variables"));
    }

    await auditService.recordAudit({
      userId: admin_id,
      event: "EMAIL_TEMPLATE_TEST_SENT",
      req,
      actorId: admin_id,
      metadata: { action, sent_to_masked: email.replace(/^(.).*(@.*)$/, "$1***$2") },
    });

    res.status(200).json({
      status: "success",
      message: req.__("Test email sent successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
