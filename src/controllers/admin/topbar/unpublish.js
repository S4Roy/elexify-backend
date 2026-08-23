import TopBar from "../../../models/TopBar.js";
import { navigationService } from "../../../services/index.js";

export const unpublish = async (req, res, next) => {
  try {
    const topBar = await TopBar.getSingleton();
    topBar.status = "draft";
    topBar.updated_by = req.auth.user_id;
    await topBar.save();
    navigationService.invalidate();
    res.status(200).json({
      status: "success",
      message: req.__("Top bar unpublished successfully"),
      data: topBar,
    });
  } catch (error) {
    next(error);
  }
};
