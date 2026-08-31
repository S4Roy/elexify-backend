import mongoose from "mongoose";
import NotificationLog from "../../../models/NotificationLog.js";
import { envs } from "../../../config/index.js";

export const history = async (req, res, next) => {
  try {
    const {
      user_id = null,
      event = null,
      channel = null,
      status = null,
      from = null,
      to = null,
      page = 1,
      limit = envs.pagination.limit,
    } = req.query;

    const match = {};
    if (user_id) match.user_id = new mongoose.Types.ObjectId(user_id);
    if (event) match.event = event;
    if (channel) match.channel = channel;
    if (status) match.status = status;
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        match.created_at.$lte = end;
      }
    }

    const pipeline = [
      { $match: match },
      { $sort: { created_at: -1 } },
      {
        $project: {
          event: 1,
          channel: 1,
          destination_masked: 1,
          template_id: 1,
          provider: 1,
          status: 1,
          attempts: "$attempt_count",
          created_at: 1,
          sent_at: 1,
        },
      },
    ];

    const data = await NotificationLog.aggregatePaginate(NotificationLog.aggregate(pipeline), {
      page,
      limit,
    });

    res.status(200).json({
      status: "success",
      message: req.__("Notification history fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
