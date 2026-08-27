import mongoose from "mongoose";
const { Schema, model } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

// Main order schema
const OrderSchema = new Schema(
  {
    id: {
      type: String,
    },
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
      // enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    order_status: {
      type: String,
      // enum: [
      //   "pending",
      //   "confirmed",
      //   "packed",
      //   "shipped",
      //   "delivered",
      //   "cancelled",
      // ],
      default: "pending",
    },

    total_amount: { type: Number, required: true },
    total_items: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    cod_fee: { type: Number, default: 0 },
    grand_total: { type: Number, required: true },

    payment_method: {
      type: String,
      // enum: ["cod", "online"],
      required: false,
    },
    transaction_id: { type: String },
    payment_meta: { type: Object, default: {} }, // optional Razorpay response etc.

    coupon_code: { type: String },
    shiprocket_order_id: { type: String },
    note: { type: String },
    paid_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
    currency: { type: String, default: "INR" },
    exchnage_rate: { type: Number, default: 1 },
    awb: { type: String },
    etd: { type: String },
    courier_name: { type: String },
    processing_at: { type: Date, default: null },
    shipped_at: { type: Date, default: null },
    delivered_at: { type: Date, default: null },
    is_migrated: { type: Boolean, default: false },

    // Set true the moment stock is actually decremented for this order
    // (COD at placement, Razorpay/PayPal at payment verification). Cancel
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

// Apply pagination plugin
OrderSchema.plugin(mongooseAggregatePaginate);

// Create and export model
const Order = model("orders", OrderSchema);
export default Order;
