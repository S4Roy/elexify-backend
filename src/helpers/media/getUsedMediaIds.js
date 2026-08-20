import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import Category from "../../models/Category.js";
import Attribute from "../../models/Attribute.js";
import AttributeValue from "../../models/AttributeValue.js";
import Blog from "../../models/Blog.js";
import Banner from "../../models/Banner.js";
import Brand from "../../models/Brand.js";
import Tag from "../../models/Tag.js";
import Page from "../../models/Page.js";

const BLOCK_FIELDS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [
  `details.block_${n}.image`,
  `details.block_${n}.bg`,
]);

// Every [Model, field] pair that can embed a Media _id. Mirrors the scan in
// controllers/admin/media/usage.js — kept as distinct() lookups here since
// this only needs a flat id set, not full documents.
const SOURCES = [
  [Product, "images"],
  [ProductVariation, "images"],
  [Category, "image"],
  [Category, "banner"],
  ...BLOCK_FIELDS.map((field) => [Category, field]),
  [Attribute, "image"],
  [AttributeValue, "image"],
  [Blog, "feature_image"],
  [Blog, "gallery"],
  [Banner, "image"],
  [Brand, "image"],
  [Tag, "image"],
  // Page's images live under `extra.images`, not top-level `images`.
  [Page, "extra.images"],
];

/**
 * Returns a Set of every Media _id (as string) currently referenced by any
 * live (non-deleted) document across the whole project.
 */
export async function getUsedMediaIds() {
  const results = await Promise.all(
    SOURCES.map(([Model, field]) =>
      Model.distinct(field, { deleted_at: null })
    )
  );
  const used = new Set();
  for (const ids of results) {
    for (const id of ids) {
      if (id) used.add(String(id));
    }
  }
  return used;
}
