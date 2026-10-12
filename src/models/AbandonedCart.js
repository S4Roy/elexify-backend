import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

// One row per abandonment episode of a signed-in customer's cart, maintained
// by services/abandonedCart (detected on a cron tick from the live Cart rows).
// Guest carts are not tracked — there is no contact to remind.
//   open      — cart idle past the abandonment threshold, no order since
//   recovered — the customer placed an order after abandoning
//   expired   — cart emptied without ordering, or idle past the expiry window
const ReminderSchema = new Schema({
  kind: { type: String, enum: ["auto", "manual"], required: true },
  step: { type: Number, default: null }, // auto sequence step (1-based)
  channels: { type: [String], default: [] }, // channels actually queued
  sent_at: { type: Date, default: Date.now },
  sent_by: { type: Types.ObjectId, ref: "users", default: null },
  coupon_code: { type: String, default: null },
}, { _id: false });

const ItemSchema = new Schema({
  product_id: { type: Types.ObjectId, ref: "products" },
  variation_id: { type: Types.ObjectId, ref: "product_variations", default: null },
  product_name: { type: String, default: "" },
  variation_name: { type: String, default: null },
  image: { type: String, default: null },
  quantity: { type: Number, default: 1 },
  unit_price: { type: Number, default: 0 },
  total_price: { type: Number, default: 0 },
}, { _id: false });

const AbandonedCartSchema = new Schema({
  user_id: { type: Types.ObjectId, ref: "users", required: true },
  status: { type: String, enum: ["open", "recovered", "expired"], default: "open" },
  abandoned_at: { type: Date, required: true },
  last_activity_at: { type: Date, required: true },
  items: { type: [ItemSchema], default: [] },
  item_count: { type: Number, default: 0 },
  cart_value: { type: Number, default: 0 },
  currency: { type: String, default: "INR" },
  reminders: { type: [ReminderSchema], default: [] },
  auto_steps_sent: { type: Number, default: 0 },
  last_reminder_at: { type: Date, default: null },
  recovered_at: { type: Date, default: null },
  recovered_order_id: { type: Types.ObjectId, ref: "orders", default: null },
  recovered_order_number: { type: String, default: null },
  recovered_value: { type: Number, default: null },
  recovered_via_reminder: { type: Boolean, default: false },
  closed_reason: { type: String, enum: ["ordered", "cart_emptied", "stale", null], default: null },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false });

// At most one open episode per customer.
AbandonedCartSchema.index({ user_id: 1 }, { unique: true, partialFilterExpression: { status: "open" } });
AbandonedCartSchema.index({ status: 1, last_activity_at: -1 });
AbandonedCartSchema.index({ abandoned_at: -1 });
AbandonedCartSchema.plugin(mongooseAggregatePaginate);

export default model("abandoned_carts", AbandonedCartSchema);
