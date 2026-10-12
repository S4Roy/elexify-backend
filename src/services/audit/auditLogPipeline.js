import mongoose from "mongoose";
import { istRange } from "../../config/storeTime.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Shared by the admin audit-log list and export endpoints so filters always
// behave identically between what an admin sees on screen and what they
// download.
export const buildAuditLogPipeline = (query = {}) => {
  const { event = null, actor_id = null, user_id = null, from = null, to = null, search = null } = query;

  const match = {};
  if (event) {
    const events = String(event).split(",").map((value) => value.trim()).filter(Boolean);
    if (events.length === 1) match.event = events[0];
    else if (events.length > 1) match.event = { $in: events };
  }
  if (actor_id && mongoose.Types.ObjectId.isValid(actor_id)) match.actor_id = new mongoose.Types.ObjectId(actor_id);
  if (user_id && mongoose.Types.ObjectId.isValid(user_id)) match.user_id = new mongoose.Types.ObjectId(user_id);
  if (from || to) match.created_at = istRange(from, to);

  const pipeline = [
    { $match: match },
    { $sort: { created_at: -1 } },
    { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "subject" } },
    { $lookup: { from: "users", localField: "actor_id", foreignField: "_id", as: "actor" } },
    { $addFields: {
      subject: { $arrayElemAt: ["$subject", 0] },
      actor: { $arrayElemAt: ["$actor", 0] },
    } },
  ];

  const term = search ? String(search).trim() : "";
  if (term) {
    const regex = new RegExp(escapeRegex(term), "i");
    pipeline.push({ $match: { $or: [
      { event: regex },
      { reason: regex },
      { "subject.name": regex }, { "subject.email": regex },
      { "actor.name": regex }, { "actor.email": regex },
    ] } });
  }

  pipeline.push({ $project: {
    event: 1, reason: 1, metadata: 1, ip: 1, user_agent: 1, created_at: 1,
    "subject._id": 1, "subject.name": 1, "subject.email": 1,
    "actor._id": 1, "actor.name": 1, "actor.email": 1,
  } });

  return pipeline;
};
