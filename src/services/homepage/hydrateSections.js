import Media from "../../models/Media.js";
import Category from "../../models/Category.js";
import MediaResource from "../../resources/MediaResource.js";

// Never fetches products/categories itself — attaches a `resolved_query`
// object describing exactly what the frontend should call
// productService.list()/categoryService.list() with, reusing the existing
// (already pricing/wishlist/cart-aware) list endpoints instead of
// duplicating that logic here.
// Replaces desktop_image/mobile_image ids on each entry of config[key]
// (hero `slides`, promo_banners `items`) with resolved media objects.
const resolveBannerMedia = async (section, key) => {
  const entries = section.config?.[key] || [];
  const mediaIds = [];
  entries.forEach((entry) => {
    if (entry.desktop_image) mediaIds.push(entry.desktop_image);
    if (entry.mobile_image) mediaIds.push(entry.mobile_image);
  });
  if (!mediaIds.length) return section;

  const mediaDocs = await Media.find({ _id: { $in: mediaIds } });
  const byId = new Map(
    mediaDocs.map((doc) => [String(doc._id), new MediaResource(doc).exec()]),
  );
  const resolved = entries.map((entry) => ({
    ...entry,
    desktop_image: entry.desktop_image
      ? (byId.get(String(entry.desktop_image)) ?? null)
      : null,
    mobile_image: entry.mobile_image
      ? (byId.get(String(entry.mobile_image)) ?? null)
      : null,
  }));
  return { ...section, config: { ...section.config, [key]: resolved } };
};

const resolveProductSectionQuery = async (section) => {
  const config = section.config || {};
  const {
    source_mode = "latest",
    product_ids = [],
    category_id = null,
    limit = 10,
    sort_by,
    sort_order,
  } = config;

  const query = { limit };
  switch (source_mode) {
    case "manual":
      query.ids = (product_ids || []).join(",");
      break;
    case "category": {
      if (category_id) {
        const category = await Category.findById(category_id).select("slug").lean();
        if (category) query.category = category.slug;
      }
      break;
    }
    case "featured":
      query.is_featured = "true";
      query.sort_by = "created_at";
      query.sort_order = -1;
      break;
    case "bestseller":
      query.is_bestseller = "true";
      query.sort_by = "created_at";
      query.sort_order = -1;
      break;
    case "discounted":
      query.sort_by = "discount_percent";
      query.sort_order = -1;
      break;
    case "latest":
    default:
      query.sort_by = "created_at";
      query.sort_order = -1;
      break;
  }
  // Explicit admin overrides win, if provided.
  if (sort_by) query.sort_by = sort_by;
  if (sort_order) query.sort_order = sort_order;

  return { ...section, config: { ...config, resolved_query: query } };
};

const resolveCategorySectionQuery = (section) => {
  const config = section.config || {};
  const { source_mode = "all", category_ids = [], limit = 6 } = config;
  const query = { limit };
  if (source_mode === "manual") {
    query.ids = (category_ids || []).join(",");
  }
  return { ...section, config: { ...config, resolved_query: query } };
};

export const hydrateSections = async (sections = []) => {
  const hydrated = [];
  for (const section of sections) {
    switch (section.type) {
      case "hero":
        hydrated.push(await resolveBannerMedia(section, "slides"));
        break;
      case "promo_banners":
        hydrated.push(await resolveBannerMedia(section, "items"));
        break;
      case "product_section":
        hydrated.push(await resolveProductSectionQuery(section));
        break;
      case "category_section":
        hydrated.push(resolveCategorySectionQuery(section));
        break;
      default:
        hydrated.push(section);
    }
  }
  return hydrated;
};
