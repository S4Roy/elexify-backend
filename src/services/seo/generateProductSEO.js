import Product from "../../models/Product.js";
import SEO from "../../models/SEO.js";
import SeoSettings from "../../models/SeoSettings.js";
import { StatusError } from "../../config/index.js";
import { resolveTemplateVariables } from "./resolveTemplateVariables.js";
import { SeoContentGenerator } from "./SeoContentGenerator/index.js";
import { calculateSeoScore } from "./calculateSeoScore.js";
import { isTitleDuplicate, isDescriptionDuplicate } from "./detectDuplicates.js";

// Generates (or regenerates) a product's meta title/description. Manually
// edited fields are preserved unless `overwrite: true` (the "Regenerate &
// Replace" action) is explicitly requested.
export const generateProductSEO = async (productId, { actorId = null, overwrite = false } = {}) => {
  const product = await Product.findById(productId)
    .populate("brand", "name")
    .populate("categories", "name")
    .populate("sub_categories", "name")
    .populate("images", "url alt_text")
    .lean();

  if (!product) throw StatusError.notFound("Product not found");

  const settings = await SeoSettings.getSingleton();

  let seo = product.seo ? await SEO.findById(product.seo) : null;
  if (!seo) {
    seo = new SEO({
      reference_id: product._id,
      reference_type: "products",
      meta_title: product.name,
      canonical_url: `/product/${product.slug}`,
    });
  }

  const variables = resolveTemplateVariables(product, settings);
  const { title, description } = SeoContentGenerator.generate({
    mode: "template",
    variables,
    settings,
    focusKeyword: seo.focus_keyword,
  });

  const writeTitle = overwrite || !seo.meta_title || !seo.title_manually_edited;
  const writeDescription = overwrite || !seo.meta_description || !seo.description_manually_edited;

  if (writeTitle) {
    seo.meta_title = title;
    seo.title_manually_edited = false;
  }
  if (writeDescription) {
    seo.meta_description = description;
    seo.description_manually_edited = false;
  }

  seo.canonical_url = `/product/${product.slug}`;
  if (writeTitle || writeDescription) {
    seo.generated = true;
    seo.generated_at = new Date();
    seo.generated_by = actorId || null;
  }
  seo.updated_at = new Date();

  await seo.save();

  if (!product.seo || String(product.seo) !== String(seo._id)) {
    await Product.findByIdAndUpdate(product._id, { seo: seo._id });
  }

  const [dupTitle, dupDescription] = await Promise.all([
    isTitleDuplicate(seo._id, seo.meta_title),
    isDescriptionDuplicate(seo._id, seo.meta_description),
  ]);

  const score = calculateSeoScore(product, seo, {
    isDuplicateTitle: dupTitle,
    isDuplicateDescription: dupDescription,
    imageAlt: product.images?.[0]?.alt_text || null,
    settings,
  });

  return { seo, score, wrote: { title: writeTitle, description: writeDescription } };
};
