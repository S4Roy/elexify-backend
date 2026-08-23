import SEO from "../../../../models/SEO.js";
import Product from "../../../../models/Product.js";
import { seoService } from "../../../../services/index.js";

// Joins via Product.seo (always reliably set) rather than SEO.reference_id —
// some legacy SEO docs predate that back-reference being populated.
const collectDocsForSet = async (field, set) => {
  if (!set.size) return [];

  const docs = await SEO.find({ reference_type: "products", [field]: { $ne: null } })
    .select(`_id ${field}`)
    .lean();

  const grouped = new Map();
  for (const doc of docs) {
    const key = (doc[field] || "").trim().toLowerCase();
    if (!set.has(key)) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ seo_id: doc._id, value: doc[field] });
  }

  const allSeoIds = Array.from(grouped.values()).flat().map((item) => item.seo_id);
  const products = await Product.find({ seo: { $in: allSeoIds }, deleted_at: null })
    .select("name slug seo")
    .lean();
  const productBySeoId = new Map(products.map((p) => [String(p.seo), p]));

  return Array.from(grouped.entries()).map(([value, items]) => ({
    value,
    items: items.map((item) => {
      const product = productBySeoId.get(String(item.seo_id));
      return {
        seo_id: item.seo_id,
        value: item.value,
        product: product ? { _id: product._id, name: product.name, slug: product.slug } : null,
      };
    }),
  }));
};

export const duplicates = async (req, res, next) => {
  try {
    const [titleSet, descriptionSet, duplicateSlugs] = await Promise.all([
      seoService.findDuplicateTitleSet(),
      seoService.findDuplicateDescriptionSet(),
      seoService.findDuplicateSlugs(),
    ]);

    const [duplicateTitles, duplicateDescriptions] = await Promise.all([
      collectDocsForSet("meta_title", titleSet),
      collectDocsForSet("meta_description", descriptionSet),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("SEO duplicates fetched successfully"),
      data: {
        duplicate_titles: duplicateTitles,
        duplicate_descriptions: duplicateDescriptions,
        duplicate_slugs: duplicateSlugs,
      },
    });
  } catch (error) {
    next(error);
  }
};
