import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// Remembers which products/variations admins were already alerted about, so
// the low-stock digest only reports new drops: one open row per item while
// it stays low/out of stock; closed (resolved_at) once restocked, after
// which a later drop alerts again. Written by services/stockAlerts.
const LowStockAlertSchema = new Schema({
  product_id: { type: Types.ObjectId, ref: "products", required: true },
  variation_id: { type: Types.ObjectId, ref: "product_variations", default: null },
  level: { type: String, enum: ["low", "out"], required: true },
  stock_quantity: { type: Number, default: 0 },
  alerted_at: { type: Date, default: Date.now },
  resolved_at: { type: Date, default: null },
}, { versionKey: false });

LowStockAlertSchema.index(
  { product_id: 1, variation_id: 1 },
  { unique: true, partialFilterExpression: { resolved_at: null } },
);
LowStockAlertSchema.index({ resolved_at: 1, alerted_at: -1 });

export default model("low_stock_alerts", LowStockAlertSchema);
