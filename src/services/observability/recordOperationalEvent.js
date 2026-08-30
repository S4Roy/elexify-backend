import OperationalEvent from "../../models/OperationalEvent.js";
import { notifyOperationalEvent } from "./sendOperationalAlert.js";

const FORBIDDEN_KEY = /(secret|token|otp|authorization|password|card|email|phone|address|payload)/i;

const sanitize = (value, depth = 0) => {
  if (depth > 3 || value == null) return value;
  if (value?._bsontype === "ObjectID" || value?._bsontype === "ObjectId") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 500);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_KEY.test(key))
    .map(([key, entry]) => [key, sanitize(entry, depth + 1)]));
};

export const recordOperationalEvent = async ({
  eventType, severity = "error", correlationId = null, summary, metadata = {},
}) => {
  const event = await OperationalEvent.findOneAndUpdate(
    { event_type: eventType, correlation_id: correlationId, status: "open" },
    {
      $set: { severity, summary: String(summary).slice(0, 500), metadata: sanitize(metadata), last_seen_at: new Date() },
      $setOnInsert: { first_seen_at: new Date() },
      $inc: { occurrences: 1 },
    },
    // Defaults for incremented fields must not also be emitted via
    // $setOnInsert, which would conflict with $inc on an upsert.
    { upsert: true, new: true, setDefaultsOnInsert: false },
  );
  await notifyOperationalEvent(event);
  return event;
};
