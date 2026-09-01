import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// One document per execution attempt of a registry operation (seeder,
// migration, backfill, or repair). Long retention, by design — this is the
// audit trail of "what data operations ran, when, by whom, with what
// result", never cleaned up by the SystemOperationLog retention cron.
const SystemOperationExecutionSchema = new Schema(
  {
    operation_key: { type: String, required: true, index: true },
    operation_name: { type: String, required: true },
    operation_type: { type: String, required: true, enum: ["SEEDER", "MIGRATION", "BACKFILL", "REPAIR"] },
    operation_version: { type: Schema.Types.Mixed, default: null },
    environment: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["QUEUED", "RUNNING", "SUCCESS", "PARTIAL", "FAILED"],
      default: "QUEUED",
    },
    dry_run: { type: Boolean, default: false },
    trigger_source: { type: String, required: true, enum: ["CLI", "ADMIN", "DEPLOYMENT", "SYSTEM"] },
    // Admin user id for ADMIN trigger source; null for CLI/DEPLOYMENT/SYSTEM.
    triggered_by: { type: Types.ObjectId, ref: "users", default: null },
    // {inserted, updated, skipped, deleted, warnings} — see shared/result.js.
    // Never contains a raw stack trace or secret.
    result: { type: Schema.Types.Mixed, default: null },
    // {code, safe_message} on failure — never a raw stack trace or secret.
    error: { type: Schema.Types.Mixed, default: null },
    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    duration_ms: { type: Number, default: null },
    // Number of SystemOperationLog lines actually persisted for this
    // execution (post log-line cap) — lets the UI show "N lines (truncated)"
    // without a separate count query.
    log_line_count: { type: Number, default: 0 },
    log_truncated: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

SystemOperationExecutionSchema.index({ operation_key: 1, environment: 1, status: 1, created_at: -1 });
SystemOperationExecutionSchema.index({ created_at: -1 });

const SystemOperationExecution = model("system_operation_executions", SystemOperationExecutionSchema);

export default SystemOperationExecution;
