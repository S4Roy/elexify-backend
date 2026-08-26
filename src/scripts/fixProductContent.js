// Cleans up authoring-tool artifacts left in product description /
// short_description HTML (stray CRs, literal "\n" text, and ChatGPT's
// data-start/data-end attributes — visible on the storefront as literal
// "\n" between paragraphs), then regenerates every product's SEO meta
// description through the existing template-based generator
// (services/seo/generateProductSEO.js) so the whole catalog ends up with
// consistent, properly sized, non-duplicate-of-title snippets. Hand-edited
// SEO fields are left untouched — generateProductSEO() skips them unless
// `overwrite` is passed, same as the "Regenerate & Replace" admin action.
//
// Usage:
//   node src/scripts/fixProductContent.js             # apply
//   node src/scripts/fixProductContent.js --dry-run    # report only, no writes

import mongoose from "../config/mongoose.js";
import Product from "../models/Product.js";
// Registered for side effects only — generateProductSEO() populates these
// paths (brand/categories/sub_categories/images) and mongoose needs the
// models registered in this process before .populate() can resolve them.
import "../models/Brand.js";
import "../models/Category.js";
import "../models/Media.js";
import { seoService } from "../services/index.js";

const DRY_RUN = process.argv.includes("--dry-run");

const cleanHtml = (html) => {
  if (!html) return html;
  return html
    .replace(/\r/g, "") // stray carriage returns
    .replace(/\\n/g, "") // literal backslash-n text (not a real newline)
    .replace(/\s+data-(start|end)="\d+"/g, "") // ChatGPT authoring artifacts
    .replace(/\s+data-section-id="[^"]*"/g, "") // Google Docs paste artifacts
    .replace(/\s+class="PDq2pG_selectionAnchorContainer"/g, "")
    .replace(/\s+role="text"/g, "")
    // "Tolerance:</strong> ?5%" — a mojibake'd "±" (28 resistor listings,
    // verified identical across all occurrences before adding this rule).
    .replace(/(Tolerance:<\/strong>\s*)\?(\d+%)/g, "$1±$2")
    .trim();
};

const run = async () => {
  console.log(DRY_RUN ? "=== DRY RUN — no writes will be made ===\n" : "=== Applying fixes ===\n");

  // ── Phase 1: strip artifacts from description / short_description ──────
  const products = await Product.find({}).select("name description short_description").lean();

  let htmlFixed = 0;
  for (const p of products) {
    const origDescription = p.description ?? null;
    const origShort = p.short_description ?? null;
    const cleanedDescription = cleanHtml(origDescription);
    const cleanedShort = cleanHtml(origShort);
    const changed = cleanedDescription !== origDescription || cleanedShort !== origShort;
    if (!changed) continue;

    htmlFixed += 1;
    const deltaDesc = (origDescription?.length || 0) - (cleanedDescription?.length || 0);
    const deltaShort = (origShort?.length || 0) - (cleanedShort?.length || 0);
    console.log(
      `[html] ${DRY_RUN ? "would fix" : "fixed"}: ${p.name} (desc -${deltaDesc} chars, short -${deltaShort} chars)`,
    );
    if (!DRY_RUN) {
      await Product.updateOne(
        { _id: p._id },
        { $set: { description: cleanedDescription, short_description: cleanedShort } },
      );
    }
  }
  console.log(`\nHTML cleanup: ${htmlFixed}/${products.length} products touched.\n`);

  // ── Phase 2: regenerate meta descriptions via the existing SEO template
  // generator — covers the whole catalog, skips manually-edited fields
  // automatically unless overwrite is set. ────────────────────────────────
  if (DRY_RUN) {
    console.log("(dry run) Skipping SEO regeneration — would run generateBulkProductSEO({ overwrite: true }) on the full catalog.");
  } else {
    const result = await seoService.generateBulkProductSEO({ overwrite: true });
    console.log("SEO regeneration result:", result);
  }

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
