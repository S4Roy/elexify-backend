import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

// A signed-in customer's "Notify me when available" request for an
// out-of-stock product (or one variation of it). services/stockAlerts sends
// a one-time BACK_IN_STOCK notification once it is back in stock.
//   active    — waiting for stock
//   notified  — alert sent (closed)
//   cancelled — customer withdrew the request
const StockAlertSubscriptionSchema = new Schema({
  user_id: { type: Types.ObjectId, ref: "users", required: true },
  product_id: { type: Types.ObjectId, ref: "products", required: true },
  variation_id: { type: Types.ObjectId, ref: "product_variations", default: null },
  status: { type: String, enum: ["active", "notified", "cancelled"], default: "active" },
  source: { type: String, enum: ["app", "web"], default: "web" },
  notified_at: { type: Date, default: null },
  channels: { type: [String], default: [] }, // channels queued when notified
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false });

// One live request per customer per product/variation.
StockAlertSubscriptionSchema.index(
  { user_id: 1, product_id: 1, variation_id: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
StockAlertSubscriptionSchema.index({ status: 1, product_id: 1, variation_id: 1 });
StockAlertSubscriptionSchema.plugin(mongooseAggregatePaginate);

export default model("stock_alert_subscriptions", StockAlertSubscriptionSchema);
