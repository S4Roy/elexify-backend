import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const ReturnRequestSchema = new Schema({
  request_number: { type: String, required: true, unique: true },
  order_id: { type: Types.ObjectId, ref: "orders", required: true, unique: true },
  customer_id: { type: Types.ObjectId, ref: "users", required: true, index: true },
  items: [{
    order_item_id: { type: Types.ObjectId, ref: "order_items", required: true },
    product_id: { type: Types.ObjectId, ref: "products", required: true },
    variation_id: { type: Types.ObjectId, ref: "product_variations", default: null },
    product_name: { type: String, required: true },
    sku: { type: String, default: null },
    quantity: { type: Number, min: 1, required: true },
    unit_price: { type: Number, min: 0, required: true },
    refundable_unit_amount: { type: Number, min: 0, required: true, default: 0 },
    accepted_quantity: { type: Number, min: 0, default: null },
    disposition: { type: String, enum: ["restock", "damaged", "reject", null], default: null },
    inspection_note: { type: String, trim: true, maxlength: 500, default: null },
  }],
  reason: { type: String, required: true },
  comment: { type: String, trim: true, maxlength: 1000, default: null },
  evidence: [{ type: Types.ObjectId, ref: "medias" }],
  status: {
    type: String,
    enum: ["requested", "approved", "rejected", "cancelled", "received", "processing", "refund_pending", "refund_failed", "manual_action_required", "completed"],
    default: "requested",
    index: true,
  },
  requested_at: { type: Date, default: Date.now },
  reviewed_at: { type: Date, default: null },
  reviewed_by: { type: Types.ObjectId, ref: "users", default: null },
  review_note: { type: String, trim: true, maxlength: 1000, default: null },
  received_at: { type: Date, default: null },
  received_by: { type: Types.ObjectId, ref: "users", default: null },
  inspected_at: { type: Date, default: null },
  inspected_by: { type: Types.ObjectId, ref: "users", default: null },
  inventory_processed_at: { type: Date, default: null },
  refund: {
    amount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["not_required", "pending", "processed", "failed", "manual_required"], default: "not_required" },
    provider: { type: String, default: null },
    provider_ref: { type: String, default: null },
    idempotency_key: { type: String, default: null },
    failure_reason: { type: String, default: null },
    processed_at: { type: Date, default: null },
  },
  policy_snapshot: {
    window_days: { type: Number, required: true },
    require_images: { type: Boolean, required: true },
    auto_approve: { type: Boolean, required: true },
  },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false });

ReturnRequestSchema.index({ status: 1, requested_at: -1 });
ReturnRequestSchema.plugin(mongooseAggregatePaginate);

export default model("return_requests", ReturnRequestSchema);
