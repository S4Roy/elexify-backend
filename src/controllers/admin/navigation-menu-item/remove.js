import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { StatusError } from "../../../config/index.js";

export const remove = async (req, res, next) => {
  try {
    const { menuId, id } = req.params;

    const item = await NavigationMenuItem.findOne({
      _id: id,
      menu_id: menuId,
      deleted_at: null,
    }).exec();
    if (!item) {
      throw StatusError.notFound(req.__("Menu item not found"));
    }

    const children = await NavigationMenuItem.find({
      parent_id: id,
      deleted_at: null,
    }).exec();
    const reparented_count = children.length;

    if (reparented_count) {
      await NavigationMenuItem.updateMany(
        { parent_id: id },
        { $set: { parent_id: item.parent_id ?? null } }
      );
    }

    const deletedItem = await NavigationMenuItem.findByIdAndUpdate(
      id,
      { $set: { deleted_by: req.auth.user_id, deleted_at: new Date() } },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Menu item deleted successfully"),
      data: { item: deletedItem, reparented_count },
    });
  } catch (error) {
    next(error);
  }
};
