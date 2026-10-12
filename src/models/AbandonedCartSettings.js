import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Singleton (AbandonedCartSettings.getSingleton()). Automatic reminders are
// off until an admin turns them on — they email/message real customers.
const StepSchema = new Schema({
  enabled: { type: Boolean, default: true },
  delay_hours: { type: Number, min: 1, max: 720, required: true },
  // Optional incentive, typically only on the last step.
  coupon_code: { type: String, default: null, trim: true, uppercase: true },
}, { _id: false });

const AbandonedCartSettingsSchema = new Schema({
  auto_reminders_enabled: { type: Boolean, default: false },
  // Cart idle this long (no add/update) counts as abandoned.
  abandon_after_minutes: { type: Number, min: 15, max: 1440, default: 60 },
  // Stop tracking (and reminding) carts idle longer than this.
  expire_after_days: { type: Number, min: 1, max: 90, default: 30 },
  // Skip reminders for carts worth less than this.
  min_cart_value: { type: Number, min: 0, default: 0 },
  // Minimum gap between any two reminders to the same customer.
  min_hours_between_reminders: { type: Number, min: 1, max: 168, default: 12 },
  steps: {
    type: [StepSchema],
    default: () => [
      { enabled: true, delay_hours: 1 },
      { enabled: true, delay_hours: 24 },
      { enabled: true, delay_hours: 72 },
    ],
  },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false });

AbandonedCartSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

export default model("abandoned_cart_settings", AbandonedCartSettingsSchema);
