import SmsTemplate from "../../../models/SmsTemplate.js";

export const list = async (req, res, next) => {
  try {
    const { search = "", status = "", category = "" } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { event: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }
    if (status) {
      filter.status = { $in: status.split(",") };
    }
    if (category) {
      filter.category = { $in: category.split(",") };
    }

    const templates = await SmsTemplate.find(filter)
      .select("event category message dlt_message_id status is_unicode template_version updated_at")
      .sort({ event: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      message: req.__("SMS templates fetched successfully"),
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};
