// services/BreadcrumbService.js
import Category from "../../../models/Category.js";

/**
 * Generate breadcrumbs for a given category.
 * Builds full slug path like /category/parent/child
 *
 * @param {String|Object} categoryOrSlug - category slug or category doc
 * @returns {Promise<Array<{name: string, slug: string}>>}
 */
export const category = async (categoryOrSlug) => {
  let category;

  // Fetch category if slug provided
  if (typeof categoryOrSlug === "string") {
    category = await Category.findOne({
      slug: categoryOrSlug,
      deleted_at: null,
    }).lean();
  } else {
    category = categoryOrSlug;
  }

  if (!category) return [];

  const breadcrumbs = [];
  let current = category;

  // Walk up the parent chain
  while (current) {
    breadcrumbs.unshift({ name: current.name, slug: current.slug });

    if (current.parent_category) {
      current = await Category.findOne({
        _id: current.parent_category,
        deleted_at: null,
      }).lean();
    } else {
      current = null;
    }
  }

  // ✅ Build full path for each breadcrumb
  let fullPath = "/collections";
  return breadcrumbs.map((crumb) => {
    fullPath += `/${crumb.slug}`;
    return {
      name: crumb.name,
      slug: fullPath,
    };
  });
};
