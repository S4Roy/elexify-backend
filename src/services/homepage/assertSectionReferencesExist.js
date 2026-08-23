import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Media from "../../models/Media.js";
import { StatusError } from "../../config/index.js";

const assertIdsExist = async (Model, ids, label) => {
  if (!ids?.length) return;
  const uniqueIds = Array.from(new Set(ids.map(String)));
  const count = await Model.countDocuments({
    _id: { $in: uniqueIds },
    deleted_at: null,
  });
  if (count !== uniqueIds.length) {
    throw StatusError.badRequest(`One or more ${label} could not be found`);
  }
};

// Never trusts admin-supplied ids at face value — every product/category/
// media reference is checked against the database before a section is saved.
export const assertSectionReferencesExist = async (type, config) => {
  if (type === "product_section") {
    if (config.source_mode === "manual") {
      await assertIdsExist(Product, config.product_ids, "products");
    }
    if (config.source_mode === "category" && config.category_id) {
      await assertIdsExist(Category, [config.category_id], "category");
    }
  }

  if (type === "category_section" && config.source_mode === "manual") {
    await assertIdsExist(Category, config.category_ids, "categories");
  }

  if (type === "hero") {
    const mediaIds = [];
    (config.slides || []).forEach((slide) => {
      if (slide.desktop_image) mediaIds.push(slide.desktop_image);
      if (slide.mobile_image) mediaIds.push(slide.mobile_image);
    });
    await assertIdsExist(Media, mediaIds, "images");
  }
};
