import HeaderConfig from "../../../models/HeaderConfig.js";
import { navigationService } from "../../../services/index.js";

export const unpublish = async (req, res, next) => {
  try {
    const headerConfig = await HeaderConfig.getSingleton();
    headerConfig.status = "draft";
    headerConfig.updated_by = req.auth.user_id;
    await headerConfig.save();
    navigationService.invalidate();
    res.status(200).json({
      status: "success",
      message: req.__("Header config unpublished successfully"),
      data: headerConfig,
    });
  } catch (error) {
    next(error);
  }
};
