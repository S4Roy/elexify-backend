import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { navigationService } from "../../../services/index.js";
import { generalHelper } from "../../../helpers/index.js";

const REFERENCE_MODEL_BY_TYPE = {
  internal_page: "pages",
  product: "products",
  category: "categories",
  collection: "categories",
  blog: "blogs",
};

export const add = async (req, res, next) => {
  try {
    const { menuId } = req.params;
    const {
      parent_id,
      type,
      label,
      icon,
      badge,
      reference_id,
      custom_url,
      target,
      order,
      enabled,
      schedule,
      mega_menu_content,
    } = req.body;

    const reference_model = REFERENCE_MODEL_BY_TYPE[type] || null;

    if (reference_model && reference_id) {
      await navigationService.assertItemReferenceExists(
        reference_model,
        reference_id
      );
    }

    const item = new NavigationMenuItem({
      menu_id: menuId,
      parent_id: generalHelper.sanitizeObjectId(parent_id) || null,
      type,
      label,
      icon: icon || null,
      badge: badge || undefined,
      reference_id: reference_model
        ? generalHelper.sanitizeObjectId(reference_id) || null
        : null,
      reference_model,
      custom_url: custom_url || null,
      target: target || "_self",
      order: order ?? 0,
      enabled: enabled !== undefined ? enabled : true,
      schedule: schedule || undefined,
      mega_menu_content:
        type === "mega_menu" ? mega_menu_content || undefined : null,
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    await item.save();

    res.status(201).json({
      status: "success",
      message: req.__("Menu item added successfully"),
      data: item,
    });
  } catch (error) {
    next(error);
  }
};
