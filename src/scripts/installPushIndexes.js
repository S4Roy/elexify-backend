// Explicit additive deployment operation; never drops or rewrites existing data/indexes.
import "dotenv/config";
import mongoose from "mongoose";
import DeviceToken from "../models/DeviceToken.js";
import PushNotification from "../models/PushNotification.js";
import PushDelivery from "../models/PushDelivery.js";
import PushCampaign from "../models/PushCampaign.js";
import NotificationPreference from "../models/NotificationPreference.js";
import NotificationJob from "../models/NotificationJob.js";
if (!process.env.PUSH_MIGRATION_MONGODB_URI)
  throw new Error("Set PUSH_MIGRATION_MONGODB_URI explicitly.");
try {
  await mongoose.connect(process.env.PUSH_MIGRATION_MONGODB_URI, {
    autoIndex: false,
  });
  for (const model of [
    DeviceToken,
    PushNotification,
    PushDelivery,
    PushCampaign,
    NotificationJob,
    NotificationPreference,
  ]) {
    await model.createIndexes();
    console.info(`Installed indexes: ${model.collection.name}`);
  }
} finally {
  await mongoose.disconnect();
}
