import Media from "../../models/Media.js";
import Category from "../../models/Category.js";
import MediaResource from "../../resources/MediaResource.js";

// Never fetches products/categories itself — attaches a `resolved_query`
// object describing exactly what the frontend should call
// productService.list()/categoryService.list() with, reusing the existing
// (already pricing/wishlist/cart-aware) list endpoints instead of
// duplicating that logic here.
const resolveHeroMedia = async (section) => {
  const slides = section.config?.slides || [];
  const mediaIds = [];
  slides.forEach((slide) => {
    if (slide.desktop_image) mediaIds.push(slide.desktop_image);
    if (slide.mobile_image) mediaIds.push(slide.mobile_image);
  });
  if (!mediaIds.length) return section;

  const mediaDocs = await Media.find({ _id: { $in: mediaIds } });
  const byId = new Map(
    mediaDocs.map((doc) => [String(doc._id), new MediaResource(doc).exec()]),
  );
  const resolvedSlides = slides.map((slide) => ({
    ...slide,
    desktop_image: slide.desktop_image
      ? (byId.get(String(slide.desktop_image)) ?? null)
      : null,
    mobile_image: slide.mobile_image
      ? (byId.get(String(slide.mobile_image)) ?? null)
      : null,
  }));
  return { ...section, config: { ...section.config, slides: resolvedSlides } };
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
        hydrated.push(await resolveHeroMedia(section));
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
