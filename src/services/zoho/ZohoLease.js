import { randomUUID } from "node:crypto";
import ZohoLease from "../../models/ZohoLease.js";

export const acquireLease = async (key, duration = 60000) => {
  const owner = randomUUID();
  try {
    const lease = await ZohoLease.findOneAndUpdate(
      { key, until: { $lte: new Date() } },
      { $set: { owner, until: new Date(Date.now() + duration) } },
      { upsert: true, new: true },
    );
    return lease ? { key, owner } : null;
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
};

export const releaseLease = lease => ZohoLease.updateOne(lease, { $set: { until: new Date(0) } });
