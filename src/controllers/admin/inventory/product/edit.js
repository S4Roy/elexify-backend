import Product from "../../../../models/Product.js";
import ProductAttribute from "../../../../models/ProductAttribute.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Media from "../../../../models/Media.js";
import SEO from "../../../../models/SEO.js";
import ProductResource from "../../../../resources/ProductResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Update Product with SEO, Media, Variations & Meta
 */
export const edit = async (req, res, next) => {
  try {
    const {
      _id,
      name,
      product_type = "simple",
      description,
      short_description,
      brand,
      category = [],
      sub_category = [],
      status,
      tags = [],
      classifications = [],
      images = [],
      meta_title,
      meta_description,
      meta_keywords,
      rarity = "",
      power_level = 0,
      ask_for_price,
      enable_enquiry,
      weight,
      length,
      width,
      height,
      shipping_class,

      regular_price,
      sale_price,
      sale_start_date,
      sale_end_date,
      sku,
      stock_status,
      stock_quantity,

      allow_backorders,
      manage_stock,
      sold_individually,

      variations = [],
      attributes = [],
      specifications = [],
    } = req.body;

    const product = await Product.findById(_id);
    if (!product) {
      throw new Error("Product not found");
    }

    // 🔹 Generate slug if name changed
    let slug = product.slug;
    if (name && name !== product.name) {
      slug = generalHelper.generateSlugName(name);
      let count = 1;
      while (await Product.exists({ slug, _id: { $ne: _id } })) {
        slug = generalHelper.generateSlugName(`${name}-${count}`);
        count++;
      }
    }

    // 🔹 Validate media
    const mediaIds = Array.isArray(images)
      ? images.map((img) => img?._id).filter(Boolean)
      : [];
    const validMediaDocs = await Media.find({ _id: { $in: mediaIds } }).select(
      "_id"
    );

    // 🔹 Validate categories
    const categoryArray = Array.isArray(category)
      ? category.filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      : [];

    // 🔹 Validate sub_categories
    const subCategoryArray = Array.isArray(sub_category)
      ? sub_category.filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      : [];
    // 🔹 Validate tags
    const tagsArray = Array.isArray(tags)
      ? tags.filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      : [];
    // 🔹 Validate classifications
    const classificationsArray = Array.isArray(classifications)
      ? classifications.filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
      : [];
    // 🔹 Update product fields
    Object.assign(product, {
      name,
      power_level,
      rarity,
      slug,
      ask_for_price,
      enable_enquiry,
      type: product_type,
      description: description || null,
      short_description: short_description || null,
      brand,
      categories: categoryArray,
      sub_categories: subCategoryArray,
      tags: tagsArray,
      classifications: classificationsArray,
      images: validMediaDocs.map((img) => img._id),
      status,
      weight,
      dimensions: { length, width, height },
      shipping_class,

      regular_price: product_type === "simple" ? regular_price : undefined,
      sale_price: product_type === "simple" ? sale_price : undefined,
      sale_start_date: product_type === "simple" ? sale_start_date : undefined,
      sale_end_date: product_type === "simple" ? sale_end_date : undefined,
      sku: product_type === "simple" ? sku : undefined,
      stock_status: product_type === "simple" ? stock_status : undefined,
      stock_quantity: product_type === "simple" ? stock_quantity : undefined,

      allow_backorders,
      manage_stock,
      sold_individually,
      updated_by: req.auth.user_id,
    });

    await product.save();

    // 🔹 Update SEO
    if (product.seo) {
      await SEO.findByIdAndUpdate(product.seo, {
        meta_title: meta_title || name,
        meta_description: meta_description || description,
        meta_keywords: meta_keywords ? meta_keywords.split(",") : [],
        canonical_url: `/product/${slug}`,
        updated_by: req.auth.user_id,
      });
    }

    // 🔹 Update media reference
    await Media.updateMany(
      { _id: { $in: validMediaDocs.map((m) => m._id) } },
      { reference_id: product._id }
    );

    // 🔹 Update attributes (single documents)
    if (product_type === "variable") {
      await ProductAttribute.deleteMany({ product_id: product._id });

      for (const attr of attributes) {
        if (!attr.attribute || !Array.isArray(attr.values)) continue;

        await ProductAttribute.findOneAndUpdate(
          { product_id: product._id, attribute_id: attr.attribute },
          {
            $set: {
              values: attr.values,
              status: "active",
              updated_by: req.auth.user_id,
            },
            $setOnInsert: {
              product_id: product._id,
              attribute_id: attr.attribute,
              created_by: req.auth.user_id,
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    // 🔹 Update variations
    if (product_type === "variable") {
      // Fetch existing variations for the product
      const existingVariations = await ProductVariation.find({
        product_id: product._id,
        deleted_at: null,
      }).select("_id");

      const existingVariationIds = existingVariations.map((v) => String(v._id));
      const incomingVariationIds = variations
        .map((v) => v._id)
        .filter((id) => id && /^[0-9a-fA-F]{24}$/.test(id));

      // 1️⃣ Soft-delete removed variations
      const variationsToSoftDelete = existingVariationIds.filter(
        (id) => !incomingVariationIds.includes(id)
      );

      if (variationsToSoftDelete.length > 0) {
        await ProductVariation.updateMany(
          { _id: { $in: variationsToSoftDelete } },
          {
            $set: {
              deleted_at: new Date(),
              deleted_by: req.auth.user_id,
            },
          }
        );
      }

      // 2️⃣ Upsert or create variations
      for (const v of variations) {
        const validVariationImages = (v.images || [])
          .map((img) => img?._id)
          .filter(Boolean);
        const foundVariationImages = await Media.find({
          _id: { $in: validVariationImages },
        }).select("_id");
        // 🔹 Generate combination_key
        const attrs = Array.isArray(v.attributes) ? v.attributes : [];
        if (attrs.length === 0) continue;

        const keyParts = attrs
          .map((a) => `${a.attribute_id.toString()}:${a.value_id.toString()}`)
          .sort();

        const combination_key = keyParts.join("|");

        const variationData = {
          product_id: product._id,
          sku: v.sku,
          power_level: v.power_level || 0,
          rarity: v.rarity || "",
          combination_key,
          visible_in_list: v.visible_in_list || false,
          ask_for_price: v.ask_for_price || false,
          enable_enquiry: v.enable_enquiry || false,
          regular_price: v.regular_price,
          sale_price: v.sale_price || null,
          stock_quantity: v.stock_quantity || 0,
          weight: v.weight || 0,
          dimensions: {
            length: v.length || 0,
            width: v.width || 0,
            height: v.height || 0,
          },
          shipping_class: v.shipping_class || null,
          attributes: v.attributes || [],
          images: foundVariationImages.map((m) => m._id),
          status: "active",
          deleted_at: null, // reset if it was soft-deleted earlier
          updated_by: req.auth.user_id,
        };

        if (v._id && /^[0-9a-fA-F]{24}$/.test(v._id)) {
          // Update existing variation
          await ProductVariation.findByIdAndUpdate(v._id, variationData);
        } else {
          // Create new variation
          const newVariation = new ProductVariation({
            ...variationData,
            created_by: req.auth.user_id,
          });
          await newVariation.save();
        }
      }
    }
    // Replace specifications
    await ProductSpecification.deleteMany({ product_id: product._id });
    if (Array.isArray(specifications) && specifications.length > 0) {
      const specsToInsert = specifications.map((spec) => ({
        product_id: product._id,
        specification_id: spec.specification_id,
        value: spec.value || "",
        key: spec.key || "",
        label: spec.label || "",
        status: "active",
        created_by: req.auth.user_id,
      }));
      if (specsToInsert.length) {
        await ProductSpecification.insertMany(specsToInsert);
      }
    }

    // ✅ Final response
    res.status(200).json({
      status: "success",
      message: req.__("Product updated successfully"),
      data: new ProductResource(product).exec(),
    });
  } catch (error) {
    console.log("Error updating product:", error);

    next(error);
  }
};
