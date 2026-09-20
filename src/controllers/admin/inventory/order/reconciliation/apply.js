import { applyForceOrderStatusRow } from "../../../../../services/orderService/forceOrderStatusImport.js";
import { applyLiveShiprocketRow } from "../../../../../services/orderService/liveShiprocketImport.js";
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

    if (["live_delivered", "force_status"].includes(auditDoc.mode)) {
      // One shipment per request keeps large imports below HTTP timeouts.
      // An atomic claim also prevents two tabs from applying the same row.
      const claimed = await ShiprocketReconciliationAudit.findOneAndUpdate(
        { _id: auditDoc._id, status: "audited", processing: false, cursor: auditDoc.cursor },
        { $set: { processing: true } }, { new: true },
      );
      if (!claimed) throw StatusError.conflict("This import is already processing. Refresh its history before retrying.");
      const candidate = claimed.candidates[claimed.cursor];
      let outcome = null;
      if (candidate) {
        try {
          if (claimed.mode === "force_status") await applyForceOrderStatusRow(candidate, req.auth.user_id, claimed.filename);
          else await applyLiveShiprocketRow(candidate, req.auth.user_id);
          outcome = { reference: candidate.reference, status: "synced" };
        } catch (error) {
          outcome = { reference: candidate.reference, status: "blocked", reason: error.message };
        }
      }
      const cursor = claimed.cursor + (candidate ? 1 : 0);
      const done = cursor >= claimed.candidates.length;
      const updated = await ShiprocketReconciliationAudit.findByIdAndUpdate(claimed._id, {
        $set: { cursor, processing: false, status: done ? "applied" : "audited", applied_by: req.auth.user_id, ...(done ? { applied_at: new Date() } : {}) },
        ...(outcome ? { $push: { outcomes: outcome } } : {}),
      }, { new: true });
      return res.status(200).json({ status: "success", data: { audit_id: updated._id, done, cursor, total: updated.candidates.length, outcome } });
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
