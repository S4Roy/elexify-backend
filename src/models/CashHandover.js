import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// One record per time a rider hands collected COD cash to the office
// (services/orderService/riderCash.js). Append-only: a shortage stays on
// the record as a negative discrepancy against the rider.
const CashHandoverSchema = new Schema(
  {
    rider_user_id: { type: Types.ObjectId, ref: "users", default: null, index: true },
    rider_name: { type: String, required: true },
    order_ids: [{ type: Types.ObjectId, ref: "orders", required: true }],
    order_count: { type: Number, required: true },
    amount_expected: { type: Number, required: true },
    amount_received: { type: Number, required: true },
    discrepancy: { type: Number, default: 0 },
    note: { type: String, default: null },
    received_by: { type: Types.ObjectId, ref: "users", required: true },
    received_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false }, versionKey: false },
);

CashHandoverSchema.index({ received_at: -1 });

export default model("cash_handovers", CashHandoverSchema);
