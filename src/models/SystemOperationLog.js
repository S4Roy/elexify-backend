import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// Per-line structured logs for a SystemOperationExecution. Short retention
// (cron-cleaned per SYSTEM_OPERATION_LOG_RETENTION_DAYS, see server.js) —
// unlike SystemOperationExecution/AuditLog, these are operational detail,
// not the audit-of-record. `message` is redacted before persistence by
// runner.js (see shared/redact.js) — never trust this collection to be
// safe without that step.
const SystemOperationLogSchema = new Schema(
  {
    execution_id: { type: Types.ObjectId, ref: "system_operation_executions", required: true, index: true },
    level: { type: String, required: true, enum: ["INFO", "WARN", "ERROR"] },
    message: { type: String, required: true },
    // Structured detail (already redacted) — optional, small.
    metadata: { type: Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

SystemOperationLogSchema.index({ execution_id: 1, timestamp: 1 });
// Supports the retention cron's range delete.
SystemOperationLogSchema.index({ created_at: 1 });

const SystemOperationLog = model("system_operation_logs", SystemOperationLogSchema);

export default SystemOperationLog;
