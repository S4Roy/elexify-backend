import EmailTemplate from "../../../models/EmailTemplate.js";
import { StatusError } from "../../../config/index.js";

export const details = async (req, res, next) => {
  try {
    const { action } = req.params;
    const template = await EmailTemplate.findOne({ action, site_language: "en" }).lean();
    if (!template) throw StatusError.notFound(req.__("Email template not found"));

    res.status(200).json({
      status: "success",
      message: req.__("Email template fetched successfully"),
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
