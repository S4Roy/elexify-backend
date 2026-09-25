import NotificationJob from "../../../models/NotificationJob.js";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import PushCampaign from "../../../models/PushCampaign.js";
import PushNotification from "../../../models/PushNotification.js";
import PushDelivery from "../../../models/PushDelivery.js";
import NotificationPreference from "../../../models/NotificationPreference.js";
import { pushConfig } from "./config.js";

export function audiencePipeline(
  campaign,
  { cursor, limit, count = false } = {}
) {
  const c = pushConfig();
  const match = { "marketing.push": true };
  const ids =
    campaign.audience === "specific" ? campaign.customer_ids.map(String) : null;
  const allowed =
    c.environment === "production"
      ? ids
      : c.allowedUsers.filter((id) => !ids || ids.includes(id));
  if (allowed)
    match.user_id = {
      $in: allowed.map((id) => new mongoose.Types.ObjectId(id)),
    };
  if (cursor) match.user_id = { ...match.user_id, $gt: cursor };
  if (campaign.audience_cutoff)
    match.created_at = { $lte: campaign.audience_cutoff };
  const pipeline = [
    { $match: match },
    { $sort: { user_id: 1 } },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "customer",
      },
    },
    {
      $match: {
        "customer.0.role": "customer",
        "customer.0.status": "active",
        "customer.0.deleted_at": null,
      },
    },
    {
      $lookup: {
        from: "device_tokens",
        let: { uid: "$user_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$user_id", "$$uid"] },
              environment: c.environment,
              project_id: c.projectId,
              is_active: true,
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "devices",
      },
    },
    { $match: { "devices.0": { $exists: true } } },
  ];
  if (count) pipeline.push({ $count: "count" });
  else pipeline.push({ $limit: limit || 100 }, { $project: { user_id: 1 } });
  return pipeline;
}
export async function countAudience(campaign) {
  const rows = await NotificationPreference.aggregate(
    audiencePipeline(campaign, { count: true })
  );
  return rows[0]?.count || 0;
}
function sign(value) {
  const secret = process.env.PUSH_CONFIRMATION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Campaign confirmation secret is not configured.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function createConfirmation(campaignId, adminId, count) {
  const payload = Buffer.from(
    JSON.stringify({
      campaignId: String(campaignId),
      adminId: String(adminId),
      count,
      expires: Date.now() + 10 * 60000,
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyConfirmation(token, campaignId, adminId) {
  try {
    const [payload, signature] = token.split(".");
    const expected = sign(payload);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.campaignId === String(campaignId) &&
      data.adminId === String(adminId) &&
      data.expires > Date.now()
      ? data
      : null;
  } catch {
    return null;
  }
}
export async function campaignStats(id) {
  const [submissions, requested, read, unqueued, jobs] = await Promise.all([
    PushDelivery.aggregate([
      { $match: { campaign_id: id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          invalid_tokens: {
            $sum: { $cond: [{ $eq: ["$error_code", "UNREGISTERED"] }, 1, 0] },
          },
        },
      },
    ]),
    PushNotification.countDocuments({ campaign_id: id }),
    PushNotification.countDocuments({
      campaign_id: id,
      read_at: { $ne: null },
    }),
    PushNotification.countDocuments({ campaign_id: id, queued: false }),
    NotificationJob.aggregate([
      { $match: { campaign_id: id, channel: "push" } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  const states = Object.fromEntries(jobs.map((r) => [r._id, r.count]));
  return {
    requested,
    read,
    submissions: Object.fromEntries(submissions.map((r) => [r._id, r.count])),
    invalid_tokens: submissions.reduce((n, r) => n + r.invalid_tokens, 0),
    pending:
      unqueued +
      (states.QUEUED || 0) +
      (states.RETRYING || 0) +
      (states.SENDING || 0),
    failed_recipients: states.DEAD_LETTER || 0,
  };
}
export async function processCampaigns() {
  const c = pushConfig();
  if (!c.enabled) return;
  const leaseId = randomUUID();
  const campaign = await PushCampaign.findOneAndUpdate(
    {
      environment: c.environment,
      status: { $in: ["SCHEDULED", "PROCESSING"] },
      scheduled_at: { $lte: new Date() },
      $or: [{ lease_until: null }, { lease_until: { $lt: new Date() } }],
    },
    {
      $set: {
        status: "PROCESSING",
        lease_id: leaseId,
        lease_until: new Date(Date.now() + 5 * 60000),
      },
    },
    { new: true, sort: { updated_at: 1, _id: 1 } }
  );
  if (!campaign) return;
  const lock = { _id: campaign._id, status: "PROCESSING", lease_id: leaseId };
  try {
    if (campaign.expires_at <= new Date()) {
      await PushCampaign.updateOne(lock, {
        $set: { status: "FAILED", sent_at: new Date() },
      });
      return;
    }
    if (!campaign.expanded) {
      const recipients = await NotificationPreference.aggregate(
        audiencePipeline(campaign, { cursor: campaign.cursor, limit: 100 })
      );
      // Bulk upsert avoids one database round trip per recipient. Durable keys permit safe restart.
      if (recipients.length && (await PushCampaign.exists(lock))) {
        await PushNotification.bulkWrite(
          recipients.map((row) => ({
            updateOne: {
              filter: {
                user_id: row.user_id,
                dedupe_key: `campaign:${campaign._id}`,
              },
              update: {
                $setOnInsert: {
                  user_id: row.user_id,
                  dedupe_key: `campaign:${campaign._id}`,
                  type: "PROMOTIONAL_CAMPAIGN",
                  category: "marketing",
                  title: campaign.title,
                  body: campaign.body,
                  image_url: campaign.image_url,
                  route: campaign.route,
                  environment: c.environment,
                  campaign_id: campaign._id,
                  expires_at: campaign.expires_at,
                  queued: false,
                },
              },
              upsert: true,
            },
          })),
          { ordered: false }
        );
      }
      await PushCampaign.updateOne(lock, {
        $set: {
          ...(recipients.length ? { cursor: recipients.at(-1).user_id } : {}),
          expanded: recipients.length < 100,
        },
      });
    } else {
      const stats = await campaignStats(campaign._id);
      if (!stats.pending)
        await PushCampaign.updateOne(lock, {
          $set: {
            status: stats.failed_recipients
              ? stats.failed_recipients === stats.requested
                ? "FAILED"
                : "PARTIALLY_FAILED"
              : "COMPLETED",
            sent_at: new Date(),
          },
        });
    }
  } finally {
    await PushCampaign.updateOne(
      { _id: campaign._id, lease_id: leaseId },
      { $set: { lease_until: null } }
    );
  }
}
