import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

export const reorder = async (req, res, next) => {
  try {
    const { menuId } = req.params;
    const { items = [] } = req.body;

    const existingItems = await NavigationMenuItem.find({
      menu_id: menuId,
      deleted_at: null,
    })
      .select("_id")
      .lean();
    const existingIds = new Set(existingItems.map((i) => String(i._id)));
    const incomingIds = items.map((i) => String(i.id));
    const incomingSet = new Set(incomingIds);

    const isExactMatch =
      incomingIds.length === existingIds.size &&
      incomingIds.length === incomingSet.size &&
      incomingIds.every((id) => existingIds.has(id));

    if (!isExactMatch) {
      throw StatusError.badRequest(
        req.__("Items must reference every existing menu item exactly once")
      );
    }

    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: {
          $set: {
            parent_id: generalHelper.sanitizeObjectId(item.parent_id) || null,
            order: item.order,
          },
        },
      },
    }));

    if (bulkOps.length) {
      await NavigationMenuItem.bulkWrite(bulkOps);
    }

    res.status(200).json({
      status: "success",
      message: req.__("Menu items reordered successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
