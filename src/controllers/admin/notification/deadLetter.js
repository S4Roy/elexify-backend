import NotificationJob from "../../../models/NotificationJob.js";
import { envs } from "../../../config/index.js";

export const deadLetter = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit } = req.query;

    const pipeline = [
      { $match: { status: "DEAD_LETTER" } },
      { $sort: { updated_at: -1 } },
      {
        $project: {
          event: 1,
          channel: 1,
          destination_masked: 1,
          template_id: 1,
          provider: 1,
          status: 1,
          attempts: 1,
          error_class: 1,
          last_error_safe: 1,
          created_at: 1,
          sent_at: "$updated_at",
        },
      },
    ];

    const data = await NotificationJob.aggregatePaginate(NotificationJob.aggregate(pipeline), {
      page,
      limit,
    });

    res.status(200).json({
      status: "success",
      message: req.__("Dead-letter notifications fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
