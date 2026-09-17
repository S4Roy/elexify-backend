import SmsTemplate from "../../../models/SmsTemplate.js";
import { StatusError } from "../../../config/index.js";

export const details = async (req, res, next) => {
  try {
    const { event } = req.params;
    const template = await SmsTemplate.findOne({ event }).lean();
    if (!template) throw StatusError.notFound(req.__("SMS template not found"));

    res.status(200).json({
      status: "success",
      message: req.__("SMS template fetched successfully"),
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
