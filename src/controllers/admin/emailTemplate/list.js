import EmailTemplate from "../../../models/EmailTemplate.js";

export const list = async (req, res, next) => {
  try {
    const { search = "" } = req.query;
    const filter = { site_language: "en" };
    if (search) {
      filter.$or = [
        { action: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const templates = await EmailTemplate.find(filter)
      .select("action subject preheader status is_marketing template_version updated_at")
      .sort({ action: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      message: req.__("Email templates fetched successfully"),
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};
