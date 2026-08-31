import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";

/**
 * Manual admin override to mark a customer's email/mobile as verified
 * without the customer completing OTP. Deliberately NOT a generic
 * "verified: true/false" toggle — permission-gated (routes/admin/
 * customers.js), reason-required, and fully audited with the previous and
 * new state (models/AuditLog.js: actor_id/reason/metadata).
 */
export const verificationOverride = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { channel, reason } = req.body;
    const admin_id = req.auth?.user_id;

    if (!["email", "mobile"].includes(channel)) {
      throw StatusError.badRequest(req.__("channel must be 'email' or 'mobile'"));
    }
    if (!reason || reason.trim().length < 10) {
      throw StatusError.badRequest(req.__("A reason of at least 10 characters is required"));
    }

    const user = await User.findOne({
      _id: id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    });
    if (!user) throw StatusError.notFound(req.__("Customer not found"));

    const field = channel === "email" ? "email_verified_at" : "mobile_verified_at";
    const previous_state = user[field] ? "verified" : "unverified";

    if (channel === "email" && !user.email) {
      throw StatusError.badRequest(req.__("This customer has no email on file"));
    }
    if (channel === "mobile" && !user.mobile) {
      throw StatusError.badRequest(req.__("This customer has no mobile number on file"));
    }

    user[field] = new Date();
    user.updated_by = admin_id;
    user.updated_at = new Date();
    await user.save();

    await auditService.recordAudit({
      userId: id,
      event: "CONTACT_VERIFICATION_OVERRIDE",
      req,
      actorId: admin_id,
      reason: reason.trim(),
      metadata: { channel, previous_state, new_state: "verified" },
    });

    res.status(200).json({
      status: "success",
      message: req.__("{{channel}} marked as verified", { channel }),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
