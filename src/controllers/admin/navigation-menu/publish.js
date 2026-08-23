import NavigationMenu from "../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { StatusError } from "../../../config/index.js";
import { navigationService } from "../../../services/index.js";

export const publish = async (req, res, next) => {
  try {
    const { id } = req.params;
    const menu = await NavigationMenu.findOne({ _id: id, deleted_at: null });
    if (!menu) throw StatusError.notFound(req.__("Menu not found"));

    const items = await NavigationMenuItem.find({
      menu_id: id,
      deleted_at: null,
    });
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            is_published: true,
            published_snapshot: {
              label: item.label,
              type: item.type,
              icon: item.icon,
              badge: item.badge,
              reference_id: item.reference_id,
              reference_model: item.reference_model,
              custom_url: item.custom_url,
              target: item.target,
              order: item.order,
              enabled: item.enabled,
              schedule: item.schedule,
              mega_menu_content: item.mega_menu_content,
              parent_id: item.parent_id,
            },
          },
        },
      },
    }));
    if (bulkOps.length) await NavigationMenuItem.bulkWrite(bulkOps);

    menu.status = "published";
    menu.published_at = new Date();
    menu.updated_by = req.auth.user_id;
    await menu.save();

    navigationService.invalidate();
    res.status(200).json({
      status: "success",
      message: req.__("Menu published successfully"),
      data: menu,
    });
  } catch (error) {
    next(error);
  }
};
