import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { StatusError } from "../../../config/index.js";
import { navigationService } from "../../../services/index.js";
import { generalHelper } from "../../../helpers/index.js";

const REFERENCE_MODEL_BY_TYPE = {
  internal_page: "pages",
  product: "products",
  category: "categories",
  collection: "categories",
  blog: "blogs",
};

export const edit = async (req, res, next) => {
  try {
    const { menuId, id } = req.params;
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

    const item = await NavigationMenuItem.findOne({
      _id: id,
      menu_id: menuId,
      deleted_at: null,
    }).exec();
    if (!item) {
      throw StatusError.notFound(req.__("Menu item not found"));
    }

    const effectiveType = type || item.type;
    const reference_model = REFERENCE_MODEL_BY_TYPE[effectiveType] || null;
    const effectiveReferenceId =
      reference_id !== undefined ? reference_id : item.reference_id;

    if (reference_model && effectiveReferenceId) {
      await navigationService.assertItemReferenceExists(
        reference_model,
        effectiveReferenceId
      );
    }

    const updateData = {
      ...(parent_id !== undefined && {
        parent_id: generalHelper.sanitizeObjectId(parent_id) || null,
      }),
      ...(type !== undefined && { type }),
      ...(label !== undefined && { label }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(badge !== undefined && { badge }),
      ...(reference_id !== undefined && {
        reference_id: reference_model
          ? generalHelper.sanitizeObjectId(reference_id) || null
          : null,
      }),
      ...(type !== undefined && { reference_model }),
      ...(custom_url !== undefined && { custom_url: custom_url || null }),
      ...(target !== undefined && { target }),
      ...(order !== undefined && { order }),
      ...(enabled !== undefined && { enabled }),
      ...(schedule !== undefined && { schedule }),
      ...(mega_menu_content !== undefined && { mega_menu_content }),
      updated_by: req.auth.user_id,
    };

    const updatedItem = await NavigationMenuItem.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Menu item updated successfully"),
      data: updatedItem,
    });
  } catch (error) {
    next(error);
  }
};
