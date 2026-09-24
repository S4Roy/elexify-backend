import mongoose from "mongoose";
const { Schema, model } = mongoose;

// One courier scan ("Picked up", "In transit — Kolkata Hub", …) for a
// shipment. Written by the Shiprocket webhook and by the on-demand tracking
// refresh (services/orderService/tracking), both through recordScans(), which
// dedupes on (order_id, awb, date, activity).
//
// Every field the writers set must be declared here: with strict mode (and
// strictQuery) on, undeclared fields are silently dropped from both inserts
// and dedupe queries — which is how scans used to end up with no order link.
const OrderScansSchema = new Schema(
  {
    order_id: { type: Schema.Types.ObjectId, ref: "orders", required: true },
    package_id: { type: Schema.Types.ObjectId, ref: "packages", default: null },
    awb: { type: String, default: null },
    date: { type: Date, default: null },
    activity: { type: String },
    location: { type: String },
    // Shiprocket's normalised label for the scan (e.g. "IN TRANSIT").
    status_label: { type: String, default: null },
    source: { type: String, enum: ["webhook", "tracking_api"], default: "webhook" },
    raw: { type: Object, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

OrderScansSchema.index({ order_id: 1, date: -1 });
OrderScansSchema.index(
  { order_id: 1, awb: 1, date: 1, activity: 1 },
  // Legacy rows written before order_id was declared have no order_id and
  // are excluded, so the index can build on existing data.
  { unique: true, partialFilterExpression: { order_id: { $exists: true } } }
);

const OrderScans = model("order_scans", OrderScansSchema);
export default OrderScans;
