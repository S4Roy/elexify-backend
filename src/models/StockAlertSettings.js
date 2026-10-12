import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Singleton (StockAlertSettings.getSingleton()). The low-stock threshold
// itself stays in SiteSetting "low_stock_threshold" — the product list and
// dashboard stats already read it from there.
const StockAlertSettingsSchema = new Schema({
  back_in_stock_enabled: { type: Boolean, default: true },
  low_stock_alerts_enabled: { type: Boolean, default: false },
  // Admin inboxes that receive the low-stock digest.
  low_stock_recipients: { type: [String], default: [] },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false });

StockAlertSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

export default model("stock_alert_settings", StockAlertSettingsSchema);
