import NavigationMenu from "../../../models/NavigationMenu.js";
import { generalHelper } from "../../../helpers/index.js";

export const add = async (req, res, next) => {
  try {
    const { name, slug: providedSlug, description } = req.body;

    const baseInput = providedSlug || name;
    let slug = generalHelper.generateSlugName(baseInput);
    let existing = await NavigationMenu.findOne({ slug, deleted_at: null }).exec();
    let count = 1;

    while (existing) {
      slug = generalHelper.generateSlugName(`${baseInput}-${count}`);
      existing = await NavigationMenu.findOne({ slug, deleted_at: null }).exec();
      count++;
    }

    const menu = new NavigationMenu({
      name,
      slug,
      description: description || null,
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    await menu.save();

    res.status(201).json({
      status: "success",
      message: req.__("Menu added successfully"),
      data: menu,
    });
  } catch (error) {
    next(error);
  }
};
