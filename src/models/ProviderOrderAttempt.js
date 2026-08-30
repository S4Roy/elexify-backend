import mongoose from "mongoose";
const { Schema, model } = mongoose;

const ProviderOrderAttemptSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "users", required: true },
  idempotency_key: { type: String, required: true },
  request_fingerprint: { type: String, required: true },
  local_order_id: { type: String, required: true },
  provider: { type: String, enum: ["razorpay"], required: true },
  provider_order_id: { type: String, default: null },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: {
    type: String,
    enum: ["creating", "created", "linked", "orphaned", "reconciling", "reconciled", "failed"],
    default: "creating",
    index: true,
  },
  last_error: { type: String, default: null },
  reconciliation_attempts: { type: Number, default: 0 },
  next_reconciliation_at: { type: Date, default: null, index: true },
  reconciled_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now, immutable: true },
  updated_at: { type: Date, default: Date.now },
}, { versionKey: false });

ProviderOrderAttemptSchema.index({ user: 1, idempotency_key: 1 }, { unique: true });
ProviderOrderAttemptSchema.index({ provider_order_id: 1 }, { unique: true, sparse: true });

export default model("provider_order_attempts", ProviderOrderAttemptSchema);
