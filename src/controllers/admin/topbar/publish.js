import TopBar from "../../../models/TopBar.js";
import { navigationService } from "../../../services/index.js";

export const publish = async (req, res, next) => {
  try {
    const topBar = await TopBar.getSingleton();
    topBar.published_announcements = JSON.parse(
      JSON.stringify(topBar.announcements)
    );
    topBar.published_contact_items = JSON.parse(
      JSON.stringify(topBar.contact_items)
    );
    topBar.status = "published";
    topBar.published_at = new Date();
    topBar.updated_by = req.auth.user_id;
    await topBar.save();
    navigationService.invalidate();
    res.status(200).json({
      status: "success",
      message: req.__("Top bar published successfully"),
      data: topBar,
    });
  } catch (error) {
    next(error);
  }
};
