import mongoose from "mongoose";
import CheckoutFailure from "../../../models/CheckoutFailure.js";
import { envs } from "../../../config/index.js";
import { istRange } from "../../../config/storeTime.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Powers the admin "Checkout Failures" view over rows written by
// services/orderService/logCheckoutFailure.js. Read-only.
export const list = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit, stage, level, user_id, from, to, search } = req.query;
    const match = {};
    const stages = String(stage || "").split(",").filter((value) => ["place_order", "verify_payment"].includes(value));
    if (stages.length) match.stage = { $in: stages };
    if (["warning", "error"].includes(level)) match.level = level;
    if (user_id && mongoose.Types.ObjectId.isValid(user_id)) match.user_id = new mongoose.Types.ObjectId(user_id);
    if (from || to) match.created_at = istRange(from, to);

    const pipeline = [
      { $match: match },
      { $sort: { created_at: -1 } },
      { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "customer" } },
      { $addFields: { customer: { $arrayElemAt: ["$customer", 0] } } },
    ];
    const term = search ? String(search).trim() : "";
    if (term) {
      const regex = new RegExp(escapeRegex(term), "i");
      pipeline.push({ $match: { $or: [
        { reason: regex },
        { "context.idempotency_key": regex }, { "context.order_id": regex },
        { "context.razorpay_order_id": regex }, { "context.razorpay_payment_id": regex },
        { "customer.name": regex }, { "customer.email": regex }, { "customer.mobile": regex },
      ] } });
    }
    pipeline.push({ $project: {
      stage: 1, level: 1, status: 1, reason: 1, client: 1, app_version: 1, ip: 1,
      context: 1, error_code: 1, stack: 1, created_at: 1,
      "customer._id": 1, "customer.name": 1, "customer.email": 1, "customer.phone_code": 1, "customer.mobile": 1,
    } });

    const data = await CheckoutFailure.aggregatePaginate(CheckoutFailure.aggregate(pipeline), { page, limit });
    res.status(200).json({ status: "success", message: "Checkout failures fetched successfully", data });
  } catch (error) { next(error); }
};
