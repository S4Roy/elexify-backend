import NotificationLog from "../../../models/NotificationLog.js";

const RANGE_MS = {
  today: 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const summary = async (req, res, next) => {
  try {
    const range = RANGE_MS[req.query.range] ? req.query.range : "today";
    const since = new Date(Date.now() - RANGE_MS[range]);

    const [byStatus, byChannel] = await Promise.all([
      NotificationLog.aggregate([
        { $match: { created_at: { $gte: since } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      NotificationLog.aggregate([
        { $match: { created_at: { $gte: since } } },
        { $group: { _id: "$channel", count: { $sum: 1 } } },
      ]),
    ]);

    const by_status = { QUEUED: 0, SENDING: 0, SENT: 0, DELIVERED: 0, FAILED: 0, RETRYING: 0, DEAD_LETTER: 0 };
    byStatus.forEach((row) => {
      if (row._id in by_status) by_status[row._id] = row.count;
    });

    const by_channel = { email: 0, sms: 0, whatsapp: 0, push: 0 };
    byChannel.forEach((row) => {
      if (row._id in by_channel) by_channel[row._id] = row.count;
    });

    res.status(200).json({
      status: "success",
      message: req.__("Notification summary fetched successfully"),
      data: { range, by_status, by_channel },
    });
  } catch (error) {
    next(error);
  }
};
