import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

// One row per failed order placement / payment verification, written by
// services/orderService/logCheckoutFailure.js and shown in the admin
// "Checkout Failures" view. Kept 90 days — long enough for support to answer
// "why couldn't I order?" without growing forever.
const CheckoutFailureSchema = new Schema({
  stage: { type: String, enum: ["place_order", "verify_payment"], required: true },
  level: { type: String, enum: ["warning", "error"], required: true },
  status: { type: Number, default: 500 },
  reason: { type: String, default: "", maxlength: 1000 },
  user_id: { type: Types.ObjectId, ref: "users", default: null },
  client: { type: String, default: "web" },
  app_version: { type: String, default: null },
  ip: { type: String, default: null },
  // Request details (idempotency key, payment method, order/provider ids…).
  context: { type: Object, default: {} },
  error_code: { type: String, default: null },
  stack: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

CheckoutFailureSchema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 86400 });
CheckoutFailureSchema.index({ user_id: 1, created_at: -1 });
CheckoutFailureSchema.index({ stage: 1, level: 1, created_at: -1 });
CheckoutFailureSchema.plugin(mongooseAggregatePaginate);

export default model("checkout_failures", CheckoutFailureSchema);
