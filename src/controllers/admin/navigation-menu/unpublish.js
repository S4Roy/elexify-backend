import NavigationMenu from "../../../models/NavigationMenu.js";
import { StatusError } from "../../../config/index.js";
import { navigationService } from "../../../services/index.js";

export const unpublish = async (req, res, next) => {
  try {
    const { id } = req.params;
    const menu = await NavigationMenu.findOne({ _id: id, deleted_at: null });
    if (!menu) throw StatusError.notFound(req.__("Menu not found"));

    menu.status = "draft";
    menu.updated_by = req.auth.user_id;
    await menu.save();

    navigationService.invalidate();

    res.status(200).json({
      status: "success",
      message: req.__("Menu unpublished successfully"),
      data: menu,
    });
  } catch (error) {
    next(error);
  }
};
