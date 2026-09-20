import { setTimeout as sleep } from "node:timers/promises";
import ZohoConnection from "../../models/ZohoConnection.js";
import { ZohoError } from "./ZohoBooksClient.js";

export const reserveRequestSlot = async connection => {
  const reserved = await ZohoConnection.findOneAndUpdate({ _id: connection._id, connected: true, generation: connection.generation }, [
    { $set: { next_request_at: { $add: [{ $max: [{ $ifNull: ["$next_request_at", new Date(0)] }, "$$NOW"] }, 750] } } },
  ], { new: true });
  if (!reserved) throw new ZohoError("ZOHO_CONNECTION_CHANGED");
  const delay = Math.max(0, reserved.next_request_at.getTime() - 750 - Date.now());
  if (delay > 20000 || reserved.paused_until > new Date()) throw new ZohoError("ZOHO_RATE_LIMIT_WAIT", {
    retryable: true, retryAfter: Math.max(delay, (reserved.paused_until?.getTime() || 0) - Date.now()),
  });
  if (delay) await sleep(delay);
};
