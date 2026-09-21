import crypto from "crypto";
import AbuseWindow from "../../models/AbuseWindow.js";

export const isSuspiciousCheckout = async (req, config) => {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const window = Math.floor(now / windowMs);
  // Client-supplied guest IDs and Origin/User-Agent headers cannot opt out.
  const identities = [`ip:${req.ip || req.socket?.remoteAddress || "unknown"}`];
  if (req.auth?.user_id) identities.push(`user:${req.auth.user_id}`);
  const counts = await Promise.all(identities.map(async identity => {
    const digest = crypto.createHmac("sha256", config.secret_key).update(identity).digest("hex");
    const _id = `checkout:${window}:${digest}`;
    const update = { $inc: { attempts: 1 }, $setOnInsert: { expires_at: new Date((window + 2) * windowMs) } };
    let record;
    try { record = await AbuseWindow.findOneAndUpdate({ _id }, update, { upsert: true, new: true }); }
    catch (error) {
      if (error?.code !== 11000) throw error;
      record = await AbuseWindow.findOneAndUpdate({ _id }, { $inc: { attempts: 1 } }, { new: true });
    }
    return record?.attempts || 0;
  }));
  return counts.some(count => count >= config.checkoutAttempts);
};
