// services/BreadcrumbService.js
import Category from "../../../models/Category.js";

/**
 * Generate breadcrumbs for a given category,
 * mark the selected category, and return its immediate childrens.
 *
 * If categoryOrSlug is not provided -> return top-level categories (those without a parent)
 *
 * @param {String|Object|null} categoryOrSlug - category slug or category doc (or null/undefined)
 * @returns {Promise<{
 *   breadcrumbs: Array<{name: string, slug: string}>,
 *   selected: string|null, // slug of the selected category or null
 *   parent: { name: string, slug: string }|null, // selected category (as parent) or null
 *   childrens: Array<{ name: string, slug: string, has_children: boolean }>
 * }>}
 */
export const category_tree = async (categoryOrSlug) => {
  // Helper: JS fallback sorter by numeric sort_order (ascending)
  const sortByOrder = (a, b) => {
    const ai = Number(a?.sort_order ?? 0);
    const bi = Number(b?.sort_order ?? 0);
    if (ai === bi) return 0;
    return ai < bi ? -1 : 1;
  };

  // If no categoryOrSlug provided, return top-level categories (no parent)
  if (!categoryOrSlug) {
    // Query DB sorted by sort_order first
    const topLevelDocs = await Category.find({
      parent_category: null,
      deleted_at: null,
      status: "active",
    })
      .sort({ sort_order: 1 })
      .lean();

    // JS-side stable fallback sort just in case
    topLevelDocs.sort(sortByOrder);

    const childrens = topLevelDocs.map((cat) => ({
      name: cat.name,
      slug: `/collections/${cat.slug}`,
      has_children: false, // top-level listing: we could compute children but keeping false to avoid extra query
    }));

    return {
      breadcrumbs: [],
      selected: null,
      parent: null,
      childrens,
    };
  }

  // --- Otherwise resolve the category (slug or doc) ---
  let category;
  if (typeof categoryOrSlug === "string") {
    category = await Category.findOne({
      slug: categoryOrSlug,
      deleted_at: null,
    }).lean();
  } else {
    category = categoryOrSlug;
  }

  if (!category) {
    return {
      breadcrumbs: [],
      selected: null,
      parent: null,
      childrens: [],
    };
  }

  // --- Build parent chain (ancestors) ---
  const ancestors = [];
  let current = category;

  while (current) {
    // prepend to ancestors to get root -> ... -> current order
    ancestors.unshift({
      name: current.name,
      slug: current.slug,
      _id: current._id,
    });

    if (current.parent_category) {
      current = await Category.findOne({
        _id: current.parent_category,
        deleted_at: null,
      }).lean();
    } else {
      current = null;
    }
  }

  // Build full path slugs for breadcrumbs: /category/parent/child...
  let fullPath = "/collections";
  const breadcrumbs = ancestors.map((crumb) => {
    fullPath += `/${crumb.slug}`;
    return {
      name: crumb.name,
      slug: fullPath,
    };
  });

  // The selected category is the provided category
  const selected = category.slug;

  // Parent object (selected category)
  const parent = {
    name: category.name,
    slug: `/collections${
      breadcrumbs.length
        ? `/${breadcrumbs.map((b) => b.slug.split("/").pop()).join("/")}`
        : `/${category.slug}`
    }`,
  };

  // --- Fetch immediate childrens of the selected category ---
  const childrenDocs = await Category.find({
    parent_category: category._id,
    deleted_at: null,
    status: "active",
  })
    .sort({ sort_order: 1 })
    .lean();

  // JS-side fallback sort to guarantee ordering
  childrenDocs.sort(sortByOrder);

  // If there are children, compute which of those children themselves have children
  let hasChildrenMap = new Map();
  if (childrenDocs.length > 0) {
    const childIds = childrenDocs.map((c) => c._id);

    // aggregation: count direct children for each childId
    const counts = await Category.aggregate([
      {
        $match: {
          parent_category: { $in: childIds },
          deleted_at: null,
          status: "active",
        },
      },
      {
        $group: {
          _id: "$parent_category",
          count: { $sum: 1 },
        },
      },
    ]);

    // build lookup map: string(id) -> boolean
    counts.forEach((r) => {
      hasChildrenMap.set(String(r._id), r.count > 0);
    });
  }

  // Compute the base path for this category (e.g. "/category/parent/selected")
  const basePathParts = breadcrumbs.map((b) => b.slug.split("/").pop()); // ["parent","selected"]
  const basePath = `/collections/${basePathParts.join("/")}`;

  const childrens = childrenDocs.map((child) => ({
    name: child.name,
    slug: `${!!hasChildrenMap.get(String(child._id)) ? basePath + "/" : ""}${
      child.slug
    }`,
    has_children: !!hasChildrenMap.get(String(child._id)),
  }));

  return {
    breadcrumbs,
    selected,
    parent,
    childrens,
  };
};
