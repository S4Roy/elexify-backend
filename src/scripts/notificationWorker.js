// Optional dedicated runner for higher throughput; uses the same Mongo queue/atomic claims as cron.
import "dotenv/config";
import mongoose from "mongoose";
import { processNotificationQueue } from "../services/notification/processNotificationQueue.js";
import { setTimeout as delay } from "node:timers/promises";
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
const batch = Math.min(
  500,
  Math.max(1, Number(process.env.NOTIFICATION_WORKER_BATCH_SIZE) || 25)
);
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  while (!stopped) {
    try {
      await processNotificationQueue(batch);
    } catch {
      console.error("notification_worker_tick_failed");
    }
    if (!stopped) await delay(1000);
  }
} finally {
  await mongoose.disconnect();
}
