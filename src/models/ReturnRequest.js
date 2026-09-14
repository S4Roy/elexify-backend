import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const ReturnRequestSchema = new Schema({
  request_number: { type: String, required: true, unique: true },
  order_id: { type: Types.ObjectId, ref: "orders", required: true, index: true },
  order_number: { type: String, default: null },
  return_type: { type: String, enum: ['refund', 'replacement'], default: 'refund' },
  submission_key: { type: String, default: null },
  pickup_address_snapshot: { type: Object, default: null },
  replacement_order_id: { type: Types.ObjectId, ref: 'orders', default: null },
  qc_status: { type: String, enum: ['pending', 'passed', 'partial', 'failed'], default: 'pending' },
  customer_id: { type: Types.ObjectId, ref: "users", required: true, index: true },
  items: [{
    order_item_id: { type: Types.ObjectId, ref: "order_items", required: true },
    product_id: { type: Types.ObjectId, ref: "products", required: true },
    variation_id: { type: Types.ObjectId, ref: "product_variations", default: null },
    product_name: { type: String, required: true },
    sku: { type: String, default: null },
    quantity: { type: Number, min: 1, required: true },
    unit_price: { type: Number, min: 0, required: true },
    purchased_quantity: { type: Number, default: null },
    quantity_offset: { type: Number, default: 0 },
    refundable_request_paise: { type: Number, default: null },
    refundable_line_paise: { type: Number, default: null },
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
    enum: ["requested", "approved", "rejected", "cancelled", "received", "processing", "refund_pending", "refund_failed", "manual_action_required", "replacement_pending", "replacement_shipped", "qc_failed", "completed"],
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
  pickup: {
    raw_status: { type: String, default: null },
    tracking_url: { type: String, default: null },
    operation_token: { type: String, default: null },
    attempt_count: { type: Number, default: 0 },
    last_attempt_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    provider_event_at: { type: Date, default: null },
    booking_snapshot: { type: Object, default: null },
    status: { type: String, enum: ["not_scheduled", "scheduled", "rescheduled", "out_for_pickup", "picked_up", "in_transit", "delivered", "failed", "cancelled"], default: "not_scheduled" },
    provider: { type: String, trim: true, maxlength: 100, default: null },
    tracking_number: { type: String, trim: true, maxlength: 150, default: null },
    scheduled_at: { type: Date, default: null },
    expected_at: { type: Date, default: null },
    rescheduled_at: { type: Date, default: null },
    reschedule_count: { type: Number, min: 0, default: 0 },
    updated_at: { type: Date, default: null },
    failure_reason: { type: String, trim: true, maxlength: 500, default: null },
    shiprocket_order_id: { type: String, default: null },
    shiprocket_shipment_id: { type: String, default: null },
    shiprocket_awb: { type: String, default: null },
    integration_status: { type: String, enum: ["not_started", "pending", "created", "failed", "unknown"], default: "not_started" },
    last_synced_at: { type: Date, default: null },
  },
  timeline: [{
    event: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, default: null },
    occurred_at: { type: Date, default: Date.now },
    actor_type: { type: String, enum: ["customer", "admin", "carrier", "system"], default: "system" },
    actor_id: { type: Types.ObjectId, ref: "users", default: null },
    note: { type: String, trim: true, maxlength: 1000, default: null },
  }],
  refund: {
    amount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["not_required", "pending", "processed", "failed", "manual_required"], default: "not_required" },
    provider: { type: String, default: null },
    provider_ref: { type: String, default: null },
    idempotency_key: { type: String, default: null },
    failure_reason: { type: String, default: null },
    processed_at: { type: Date, default: null },
    attempted_at: { type: Date, default: null },
  },
  policy_snapshot: {
    window_days: { type: Number, required: true },
    require_images: { type: Boolean, required: true },
    auto_approve: { type: Boolean, required: true },
  },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false });

ReturnRequestSchema.index({ status: 1, requested_at: -1 });
ReturnRequestSchema.index({ order_id: 1, submission_key: 1 }, { unique: true, partialFilterExpression: { submission_key: { $type: 'string' } } });
ReturnRequestSchema.index({ 'pickup.shiprocket_order_id': 1 });
ReturnRequestSchema.index({ 'pickup.shiprocket_awb': 1 });
ReturnRequestSchema.index({ 'pickup.shiprocket_shipment_id': 1 });
ReturnRequestSchema.plugin(mongooseAggregatePaginate);

export default model("return_requests", ReturnRequestSchema);
