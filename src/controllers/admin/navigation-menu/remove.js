import NavigationMenu from "../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { StatusError } from "../../../config/index.js";
import { navigationService } from "../../../services/index.js";

export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Menu ID is required"));
    }

    const menu = await NavigationMenu.findOne({ _id, deleted_at: null }).exec();
    if (!menu) {
      throw StatusError.notFound(req.__("Menu not found"));
    }

    const updatedMenu = await NavigationMenu.findByIdAndUpdate(
      _id,
      { $set: { deleted_by: req.auth.user_id, deleted_at: new Date() } },
      { new: true }
    );

    await NavigationMenuItem.updateMany(
      { menu_id: _id, deleted_at: null },
      { $set: { deleted_by: req.auth.user_id, deleted_at: new Date() } }
    );

    navigationService.invalidate();

    res.status(200).json({
      status: "success",
      message: req.__("Menu deleted successfully"),
      data: updatedMenu,
    });
  } catch (error) {
    next(error);
  }
};
