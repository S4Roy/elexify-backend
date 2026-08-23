import NavigationMenu from "../../../models/NavigationMenu.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

export const edit = async (req, res, next) => {
  try {
    const { _id, name, slug: providedSlug, description } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Menu ID is required"));
    }

    const menu = await NavigationMenu.findOne({ _id, deleted_at: null }).exec();
    if (!menu) {
      throw StatusError.notFound(req.__("Menu not found"));
    }

    let slug = menu.slug;
    const wantsSlugChange =
      (providedSlug && providedSlug !== menu.slug) ||
      (!providedSlug && name && name !== menu.name);

    if (wantsSlugChange) {
      const baseInput = providedSlug || name;
      slug = generalHelper.generateSlugName(baseInput);
      let existing = await NavigationMenu.findOne({
        slug,
        deleted_at: null,
        _id: { $ne: _id },
      }).exec();
      let count = 1;

      while (existing) {
        slug = generalHelper.generateSlugName(`${baseInput}-${count}`);
        existing = await NavigationMenu.findOne({
          slug,
          deleted_at: null,
          _id: { $ne: _id },
        }).exec();
        count++;
      }
    }

    const updateData = {
      ...(name !== undefined && { name }),
      slug,
      ...(description !== undefined && { description: description || null }),
      updated_by: req.auth.user_id,
    };

    const updatedMenu = await NavigationMenu.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Menu updated successfully"),
      data: updatedMenu,
    });
  } catch (error) {
    next(error);
  }
};
