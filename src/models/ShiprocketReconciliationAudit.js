import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// One doc per CSV upload in the admin panel's Shiprocket reconciliation
// flow (Orders -> Update status -> Reconcile from Shiprocket export):
// upload -> dry-run "audit" (stored here, zero DB writes elsewhere) ->
// admin reviews the report -> explicit "apply" re-runs the exact same
// parsed rows for real. Storing the parsed rows (not just the report)
// is what lets apply reuse precisely what was audited, instead of trusting
// a re-upload to be byte-identical or re-parsing something that may have
// changed on disk between the two steps.
//
// Short-lived by design (see the TTL index below) — this is a workflow
// scratchpad, not a permanent audit trail. The real, permanent trail is
// each affected Order's own manual_status_history entry, written at apply
// time with a reason noting this reconciliation.
const ShiprocketReconciliationAuditSchema = new Schema(
  {
    filename: { type: String, default: null },
    rows: { type: [Schema.Types.Mixed], required: true },
    dry_run_report: { type: Schema.Types.Mixed, required: true },
    apply_report: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ["audited", "applied"], default: "audited", index: true },
    uploaded_by: { type: Types.ObjectId, ref: "users", required: true },
    applied_by: { type: Types.ObjectId, ref: "users", default: null },
    applied_at: { type: Date, default: null },
    // TTL: an audit nobody acts on within 2 days is cleaned up automatically
    // rather than accumulating forever — re-uploading the export is cheap.
    created_at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 2 },
  },
  { versionKey: false },
);

export default model("shiprocket_reconciliation_audits", ShiprocketReconciliationAuditSchema);
