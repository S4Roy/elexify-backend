import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// One document per operation_key — the CAS lock runner.js acquires before
// running a handler, so two backend instances (or an admin click + a
// concurrent CLI run) can never execute the same operation at once. See
// shared/lock.js for the acquire/release/heartbeat logic.
const SystemOperationLockSchema = new Schema(
  {
    operation_key: { type: String, required: true },
    locked: { type: Boolean, default: false },
    locked_at: { type: Date, default: null },
    heartbeat_at: { type: Date, default: null },
    holder_id: { type: Types.ObjectId, ref: "users", default: null },
    execution_id: { type: Types.ObjectId, ref: "system_operation_executions", default: null },
  },
  { versionKey: false },
);

SystemOperationLockSchema.index({ operation_key: 1 }, { unique: true });

const SystemOperationLock = model("system_operation_locks", SystemOperationLockSchema);

export default SystemOperationLock;
