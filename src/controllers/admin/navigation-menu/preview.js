import NavigationMenu from "../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { StatusError } from "../../../config/index.js";
import { navigationService } from "../../../services/index.js";

export const preview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const menu = await NavigationMenu.findOne({
      _id: id,
      deleted_at: null,
    }).lean();
    if (!menu) throw StatusError.notFound(req.__("Menu not found"));

    const items = await NavigationMenuItem.find({
      menu_id: id,
      deleted_at: null,
    }).lean();
    const tree = navigationService.resolveVisibleMenuTree(items, {
      source: "draft",
    });
    const hydratedTree = await navigationService.hydrateMenuTree(tree);

    res.status(200).json({
      status: "success",
      message: req.__("Menu preview fetched successfully"),
      data: { menu, tree: hydratedTree },
    });
  } catch (error) {
    next(error);
  }
};
