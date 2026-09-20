import { StatusError } from "../../../../../config/index.js";
import { orderService } from "../../../../../services/index.js";
import ShiprocketReconciliationAudit from "../../../../../models/ShiprocketReconciliationAudit.js";

// Step 2: re-runs the exact rows a prior audit() call parsed and reviewed,
// this time with apply:true so matched Orders/Packages are actually
// written. The typed confirmation string (validated in the route's Joi
// schema, same convention as Data Operations' HIGH-risk confirmation) is
// the last line of defense against a stray click applying a bulk status
// change to potentially thousands of orders.
export const apply = async (req, res, next) => {
  try {
    const { audit_id } = req.body;
    const auditDoc = await ShiprocketReconciliationAudit.findById(audit_id);
    if (!auditDoc) throw StatusError.notFound("Audit not found or expired (audits are kept for 2 days) — upload the CSV again.");
    if (auditDoc.status === "applied") {
      throw StatusError.conflict(
        `This audit was already applied at ${auditDoc.applied_at.toISOString()}. Upload a fresh export to reconcile again.`,
      );
    }

    const report = await orderService.reconcileShiprocketOrderStatus({ rows: auditDoc.rows, apply: true });
    auditDoc.status = "applied";
    auditDoc.apply_report = report;
    auditDoc.applied_by = req.auth.user_id;
    auditDoc.applied_at = new Date();
    await auditDoc.save();

    return res.status(200).json({
      status: "success",
      data: { audit_id: auditDoc._id, report },
    });
  } catch (error) {
    next(error);
  }
};
