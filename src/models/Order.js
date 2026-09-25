import mongoose from "mongoose";
const { Schema, model } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import {
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
} from "../constants/orderStatus.js";

// Main order schema
const OrderSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    created_by_admin: { type: Schema.Types.ObjectId, ref: "users", default: null },
    source: { type: String, enum: ["storefront", "admin"], default: "storefront" },
    replacement_return_id: { type: Schema.Types.ObjectId, ref: "return_requests", default: null },
    original_order_id: { type: Schema.Types.ObjectId, ref: "orders", default: null },
    user: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: false,
      default: null,
    }, // ✅ Nullable for guest users

    shipping_address: {
      type: Schema.Types.ObjectId,
      ref: "address",
      required: false,
      default: null,
    },
    billing_address: {
      type: Schema.Types.ObjectId,
      ref: "address",
      required: false,
      default: null,
    },

    payment_status: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: "pending",
    },

    order_status: {
      type: String,
      enum: ORDER_STATUS_VALUES,
      default: "pending",
    },

    total_amount: { type: Number, required: true },
    total_items: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    cod_fee: { type: Number, default: 0 },
    grand_total: { type: Number, required: true },

    // Partial COD: an online advance is required up front, the rest is
    // collected as Cash on Delivery. is_partial_cod is the single flag
    // every downstream consumer (Shiprocket payload, invoice, email, admin/
    // storefront display) branches on; advance_amount + cod_due_amount
    // always sum to grand_total for these orders and are otherwise 0.
    is_partial_cod: { type: Boolean, default: false },
    advance_amount: { type: Number, default: 0 },
    cod_due_amount: { type: Number, default: 0 },

    payment_method: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      required: false,
    },
    transaction_id: { type: String },
    idempotency_key: { type: String, default: null },
    idempotency_fingerprint: { type: String, default: null },
    idempotency_fingerprint_version: { type: Number, default: 1 },
    payment_meta: { type: Object, default: {} }, // optional Razorpay response etc.
    manual_payment: {
      type: new Schema({
        amount: Number, currency: String, method: String, reference: String,
        received_at: Date, reason: String,
        recorded_by: { type: Schema.Types.ObjectId, ref: "users" },
        recorded_at: Date,
      }, { _id: false }),
      default: undefined,
    },
    manual_status_history: [{
      from: String,
      to: String,
      reason: String,
      changed_by: { type: Schema.Types.ObjectId, ref: "users" },
      changed_at: { type: Date, default: Date.now },
    }],

    coupon_code: { type: String },
    shiprocket_order_id: { type: String },
    shiprocket_shipment_id: { type: String },
    note: { type: String },
    paid_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
    currency: { type: String, default: "INR" },
    exchange_rate: { type: Number, default: 1 },
    awb: { type: String },
    etd: { type: String },
    shiprocket_status: { type: String, default: null },
    shiprocket_status_updated_at: { type: Date, default: null },
    // Legacy single-shipment orders only: last courier-scan refresh.
    tracking_synced_at: { type: Date, default: null },
    courier_name: { type: String },
    // When the order was accepted (payment captured / COD placed) vs. when
    // the merchant started preparing it. Legacy orders only carry
    // processing_at, which then doubles as the confirmation time.
    confirmed_at: { type: Date, default: null },
    processing_at: { type: Date, default: null },
    shipped_at: { type: Date, default: null },
    delivered_at: { type: Date, default: null },
    legacy_import: { type: Object, default: undefined },
    is_migrated: { type: Boolean, default: false },

    // Denormalized from the order's Package docs (src/models/Package.js) so
    // the paginated admin order list can gate "Send to ShipRocket" /"Ship
    // Remaining Items" per row without an aggregation per row. Updated
    // transactionally by src/services/orderService/packages/*.
    package_count: { type: Number, default: 0 },
    fully_packed: { type: Boolean, default: false },

    // Set true the moment stock is actually decremented for this order
    // (COD at placement, Razorpay at payment verification). Cancel
    // flow gates inventory restoration on this flag rather than inferring
    // from payment_method/payment_status, since historical COD orders
    // placed before this field existed never decremented stock at all.
    stock_reserved: { type: Boolean, default: false },
    inventory_reverted: { type: Boolean, default: false },

    cancellation: {
      reason: { type: String, default: null },
      comment: { type: String, default: null },
      requested_at: { type: Date, default: null },
      cancelled_at: { type: Date, default: null },
      // No `default: null` here — Mongoose applies defaults at document
      // creation, and an enum validator rejects `null` unless it's an
      // explicit enum member. Leaving it undefined until actually set
      // lets enum validation skip unset orders (the vast majority).
      cancelled_by: { type: String, enum: ["customer", "admin"] },
      // True only when cancelled via the superadmin force-cancel override
      // (bypassed the normal eligibility rules) — see cancelOrder.js `force`.
      forced: { type: Boolean, default: false },
    },

    refund: {
      razorpay_refund_id: { type: String, default: null },
      razorpay_payment_id: { type: String, default: null },
      amount: { type: Number, default: null },
      status: {
        type: String,
        enum: ["not_required", "processing", "processed", "failed"],
        default: "not_required",
      },
      failure_reason: { type: String, default: null },
      idempotency_key: { type: String, default: null },
      initiated_at: { type: Date, default: null },
      completed_at: { type: Date, default: null },
      attempted_at: { type: Date, default: null },
    },

    // Denormalized pointer for fast eligibility checks/display. Written
    // once at generation time and never mutated again — the full frozen
    // snapshot (line items, addresses, totals, GST breakdown) lives in the
    // separate Invoice collection (src/models/Invoice.js).
    invoice: {
      generated: { type: Boolean, default: false },
      invoice_number: { type: String, default: null },
      invoice_date: { type: Date, default: null },
      generated_at: { type: Date, default: null },
    },

    // Point-in-time copies of the resolved billing/shipping Address docs,
    // captured at order placement. billing_address/shipping_address above
    // remain live refs (existing behavior, unchanged); these snapshots
    // exist so an invoice never reflects a later address edit/deletion.
    // Orders placed before this field existed have these as null — the
    // invoice service falls back to the live ref for those (best-effort).
    billing_address_snapshot: { type: Object, default: null },
    shipping_address_snapshot: { type: Object, default: null },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true, // Prevents modification
    },
    updated_at: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
  }
);

// Indexes for performance
OrderSchema.index({ user: 1, created_at: -1 });
OrderSchema.index({ order_status: 1 });
OrderSchema.index({ "products.product": 1 });
// Matches the {deleted_at, created_at range} $match every dashboard
// endpoint (trend/performance/leaderboard/geo-stats) opens with — without
// this they fell back to a full collection scan of every order.
OrderSchema.index({ deleted_at: 1, created_at: -1 });
OrderSchema.index({ billing_address: 1 });
OrderSchema.index(
  { user: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: "string" } } },
);

OrderSchema.index({ replacement_return_id: 1 }, { unique: true, partialFilterExpression: { replacement_return_id: { $type: "objectId" } } });

// A receipt may settle only one order; the partial index excludes gateway payments.
OrderSchema.index(
  { "manual_payment.method": 1, "manual_payment.reference": 1 },
  { unique: true, partialFilterExpression: { "manual_payment.reference": { $type: "string" } } },
);

// Apply pagination plugin
OrderSchema.add({
  zoho: {
    contact_queued_organization_id: String,
    packed_at: Date,
    version: { type: Number, default: 0 },
    completed_version: { type: Number, default: 0 },
    organization_id: String,
    salesorder_id: String,
    salesorder_number: String,
    sync_status: String,
    synced_at: Date,
  },
});
OrderSchema.index({ "zoho.packed_at": 1 });
OrderSchema.plugin(mongooseAggregatePaginate);

// Create and export model
const Order = model("orders", OrderSchema);
export default Order;
