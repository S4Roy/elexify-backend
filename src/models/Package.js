import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// One document per Shiprocket shipment. An order that's shipped in one go
// (today's default, unchanged behavior) still gets exactly one Package doc
// — there is no separate "single-package order" code path. Historical
// orders placed before this model existed simply have zero Package docs
// and keep rendering via the legacy Order.awb/courier_name/etd fields.
//
// Mirrors the proven shape of ReturnRequest.pickup (src/models/
// ReturnRequest.js) for the Shiprocket-integration bookkeeping fields
// (operation_token/integration_status/timeline) — that reverse-shipment
// flow already solved safe-retry and webhook-correlation for this exact
// external API, so the same fields/semantics are reused here rather than
// inventing a new pattern.
const PackageSchema = new Schema(
  {
    order_id: { type: Types.ObjectId, ref: "orders", required: true, index: true },
    package_number: { type: Number, required: true },
    reference_id: { type: String, default: null },

    // Logistics state, once the Shiprocket API call itself is confirmed
    // successful (see integration_status below for the API-call outcome).
    status: {
      type: String,
      enum: [
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
        "failed",
      ],
      default: "packed",
    },

    items: [
      {
        order_item_id: { type: Types.ObjectId, ref: "order_items", required: true },
        quantity: { type: Number, min: 1, required: true },
      },
    ],

    weight: { type: Number, default: null },
    length: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    pickup_location: { type: String, default: null },

    // Composite id we control, e.g. "ORD-010708-P2" — unique per package so
    // each is a distinct Shiprocket order, unlike the parent Order's own id.
    shiprocket_order_id: { type: String, default: null },
    shiprocket_shipment_id: { type: String, default: null },
    awb: { type: String, default: null },
    shiprocket_status: { type: String, default: null },
    shiprocket_status_updated_at: { type: Date, default: null },
    courier_name: { type: String, default: null },
    etd: { type: String, default: null },
    tracking_url: { type: String, default: null },
    // Last on-demand courier-scan refresh (customer tracking views); throttles
    // Shiprocket tracking API calls — see services/orderService/tracking.
    tracking_synced_at: { type: Date, default: null },

    // Outcome of the Shiprocket API call itself — separate from `status`
    // (the shipment's logistics state) — exactly like ReturnRequest.pickup.
    // "unknown" means the call's result is ambiguous (e.g. a timeout) and
    // must be reconciled/retried manually rather than blindly resubmitted,
    // which is what prevents duplicate shipments/AWBs.
    integration_status: {
      type: String,
      enum: ["pending", "created", "failed", "unknown"],
      default: "pending",
    },
    operation_token: { type: String, default: null },
    attempt_count: { type: Number, default: 0 },
    last_attempt_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    booking_snapshot: { type: Object, default: null },

    // Idempotent webhook event log — a redelivered status update is
    // recognized and skipped by checking this before applying a change.
    timeline: [
      {
        status: { type: String, required: true },
        occurred_at: { type: Date, default: Date.now },
        raw: { type: Object, default: null },
      },
    ],

    shipped_at: { type: Date, default: null },
    delivered_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    created_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false },
);

PackageSchema.index({ order_id: 1, package_number: 1 }, { unique: true });
PackageSchema.index(
  { reference_id: 1 },
  { unique: true, partialFilterExpression: { reference_id: { $type: "string" } } },
);
PackageSchema.index(
  { shiprocket_order_id: 1 },
  { unique: true, partialFilterExpression: { shiprocket_order_id: { $type: "string" } } },
);
PackageSchema.index(
  { awb: 1 },
  { unique: true, partialFilterExpression: { awb: { $type: "string" } } },
);
PackageSchema.index(
  { shiprocket_shipment_id: 1 },
  { unique: true, partialFilterExpression: { shiprocket_shipment_id: { $type: "string" } } },
);

export default model("packages", PackageSchema);
