import HeaderConfig from "../../../models/HeaderConfig.js";
import { navigationService } from "../../../services/index.js";

export const publish = async (req, res, next) => {
  try {
    const headerConfig = await HeaderConfig.getSingleton();
    headerConfig.published = JSON.parse(JSON.stringify(headerConfig.draft));
    headerConfig.status = "published";
    headerConfig.published_at = new Date();
    headerConfig.updated_by = req.auth.user_id;
    await headerConfig.save();
    navigationService.invalidate();
    res.status(200).json({
      status: "success",
      message: req.__("Header config published successfully"),
      data: headerConfig,
    });
  } catch (error) {
    next(error);
  }
};
