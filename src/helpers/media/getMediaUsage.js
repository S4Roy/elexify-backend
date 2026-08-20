import mongoose from "mongoose";
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

const BLOCK_KEYS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `details.block_${n}`);

/**
 * Scans every collection that can embed a Media _id and reports which live
 * (non-deleted) documents currently reference it. Shared by the "used in"
 * lookup endpoint and the delete-guard (media can only be soft-deleted while
 * this list is empty).
 */
export async function getMediaUsage(mediaId, { limit = 20 } = {}) {
  const notDeleted = { deleted_at: null };

  const [
    products,
    variations,
    categories,
    attributes,
    attributeValues,
    blogs,
    banners,
    brands,
    tags,
    pages,
  ] = await Promise.all([
    Product.find({ images: mediaId, ...notDeleted }, { name: 1, slug: 1 })
      .limit(limit)
      .lean(),
    ProductVariation.find(
      { images: mediaId, ...notDeleted },
      { sku: 1, product_id: 1 }
    )
      .populate({ path: "product_id", select: "name slug" })
      .limit(limit)
      .lean(),
    Category.find(
      {
        ...notDeleted,
        $or: [
          { image: mediaId },
          { banner: mediaId },
          ...BLOCK_KEYS.flatMap((k) => [
            { [`${k}.image`]: mediaId },
            { [`${k}.bg`]: mediaId },
          ]),
        ],
      },
      { name: 1, slug: 1 }
    )
      .limit(limit)
      .lean(),
    Attribute.find({ image: mediaId, ...notDeleted }, { name: 1, slug: 1 })
      .limit(limit)
      .lean(),
    AttributeValue.find(
      { image: mediaId, ...notDeleted },
      { name: 1, slug: 1 }
    )
      .limit(limit)
      .lean(),
    Blog.find(
      { ...notDeleted, $or: [{ feature_image: mediaId }, { gallery: mediaId }] },
      { title: 1, slug: 1 }
    )
      .limit(limit)
      .lean(),
    Banner.find({ image: mediaId, ...notDeleted }, { title: 1 })
      .limit(limit)
      .lean(),
    Brand.find({ image: mediaId, ...notDeleted }, { name: 1, slug: 1 })
      .limit(limit)
      .lean(),
    Tag.find({ image: mediaId, ...notDeleted }, { name: 1, slug: 1 })
      .limit(limit)
      .lean(),
    // Page's images live under `extra.images`, not top-level `images`.
    Page.find(
      { "extra.images": mediaId, ...notDeleted },
      { title: 1, slug: 1 }
    )
      .limit(limit)
      .lean(),
  ]);

  return [
    ...products.map((p) => ({
      type: "Product",
      id: p._id,
      label: p.name,
      slug: p.slug,
    })),
    ...variations.map((v) => ({
      type: "Product Variation",
      id: v._id,
      label: v.product_id?.name ? `${v.product_id.name} (${v.sku})` : v.sku,
      slug: v.product_id?.slug,
    })),
    ...categories.map((c) => ({
      type: "Category",
      id: c._id,
      label: c.name,
      slug: c.slug,
    })),
    ...attributes.map((a) => ({
      type: "Attribute",
      id: a._id,
      label: a.name,
      slug: a.slug,
    })),
    ...attributeValues.map((a) => ({
      type: "Attribute Value",
      id: a._id,
      label: a.name,
      slug: a.slug,
    })),
    ...blogs.map((b) => ({
      type: "Blog",
      id: b._id,
      label: b.title,
      slug: b.slug,
    })),
    ...banners.map((b) => ({ type: "Banner", id: b._id, label: b.title })),
    ...brands.map((b) => ({
      type: "Brand",
      id: b._id,
      label: b.name,
      slug: b.slug,
    })),
    ...tags.map((t) => ({
      type: "Tag",
      id: t._id,
      label: t.name,
      slug: t.slug,
    })),
    ...pages.map((p) => ({
      type: "Page",
      id: p._id,
      label: p.title,
      slug: p.slug,
    })),
  ];
}

export function toMediaObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}
