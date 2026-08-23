import Product from "../../models/Product.js";
import SeoSettings from "../../models/SeoSettings.js";
import { calculateSeoScore } from "./calculateSeoScore.js";
import { findDuplicateTitleSet, findDuplicateDescriptionSet } from "./detectDuplicates.js";

// Shared by the SEO Manager report endpoint and bulk-generate's filter mode.
// No job-queue/aggregation-pipeline scoring exists in this codebase, so score
// is computed in application code over the full (non-deleted) catalog — fine
// for current catalog sizes; documented as a scaling caveat in the plan.
export const getProductSeoRows = async ({ search } = {}) => {
  const query = { deleted_at: null };
  if (search) query.name = { $regex: search, $options: "i" };

  const [products, settings, dupTitles, dupDescriptions] = await Promise.all([
    Product.find(query)
      .populate("seo")
      .populate("brand", "name")
      .populate("categories", "name")
      .populate("images", "url alt_text")
      .sort({ created_at: -1 })
      .lean(),
    SeoSettings.getSingleton(),
    findDuplicateTitleSet(),
    findDuplicateDescriptionSet(),
  ]);

  return products.map((product) => {
    const seo = product.seo || null;
    const score = calculateSeoScore(product, seo, {
      isDuplicateTitle: seo ? dupTitles.has((seo.meta_title || "").trim().toLowerCase()) : false,
      isDuplicateDescription: seo
        ? dupDescriptions.has((seo.meta_description || "").trim().toLowerCase())
        : false,
      imageAlt: product.images?.[0]?.alt_text || null,
      settings,
    });
    return { product, seo, score };
  });
};

export const SEO_REPORT_FILTERS = {
  missing_title: (row) => !row.seo?.meta_title,
  missing_description: (row) => !row.seo?.meta_description,
  missing_keyword: (row) => !row.seo?.focus_keyword,
  duplicate_title: (row) => row.score.checks.find((c) => c.id === "no_duplicate_title")?.pass === false,
  duplicate_description: (row) =>
    row.score.checks.find((c) => c.id === "no_duplicate_description")?.pass === false,
  poor: (row) => row.score.status === "Poor",
  needs_improvement: (row) => row.score.status === "Needs Improvement",
  good: (row) => row.score.status === "Good",
};

export const applySeoReportFilter = (rows, filter) =>
  filter && SEO_REPORT_FILTERS[filter] ? rows.filter(SEO_REPORT_FILTERS[filter]) : rows;
