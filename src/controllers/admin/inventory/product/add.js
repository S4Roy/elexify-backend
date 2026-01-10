import Product from "../../../../models/Product.js";
import ProductAttribute from "../../../../models/ProductAttribute.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Media from "../../../../models/Media.js";
import SEO from "../../../../models/SEO.js";
import { StatusError } from "../../../../config/index.js";
import ProductResource from "../../../../resources/ProductResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Product with SEO, Media, Variations & Meta
 */
export const add = async (req, res, next) => {
  try {
    const {
      name,
      product_type = "simple",
      description,
      short_description,
      brand,
      category = [],
      tags = [],
      classifications = [],
      sub_category = [],
      status,

      images = [],
      meta_title,
      meta_description,
      meta_keywords,

      weight,
      length,
      width,
      height,
      shipping_class,
      rarity = "",
      power_level = 0,
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
      ask_for_price,
      enable_enquiry,
    } = req.body;

    // 🔹 Slug generation
    let slug = generalHelper.generateSlugName(name);
    let count = 1;
    while (await Product.exists({ slug })) {
      slug = generalHelper.generateSlugName(`${name}-${count}`);
      count++;
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

    // 🔹 Create SEO
    const seo = new SEO({
      meta_title: meta_title || name,
      reference_type: "products",
      meta_description: meta_description || "",
      meta_keywords: meta_keywords ? meta_keywords.split(",") : [],
      canonical_url: `/product/${slug}`,
      created_by: req.auth.user_id,
    });
    await seo.save();

    // 🔹 Create product
    const product = new Product({
      type: product_type,
      power_level,
      name,
      rarity,
      slug,
      ask_for_price,
      enable_enquiry,
      description: description || null,
      short_description: short_description || null,
      brand,
      categories: categoryArray,
      sub_categories: subCategoryArray,
      tags: tagsArray,
      classifications: classificationsArray,
      images: validMediaDocs.map((img) => img._id),
      status: status || "active",
      seo: seo._id,
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
      created_by: req.auth.user_id,
    });

    await product.save();

    // 🔹 Update SEO and Media reference
    await Promise.all([
      SEO.findByIdAndUpdate(seo._id, { reference_id: product._id }),
      Media.updateMany(
        { _id: { $in: validMediaDocs.map((m) => m._id) } },
        { reference_id: product._id }
      ),
    ]);

    // 🔹 Save attributes individually
    if (product_type === "variable" && Array.isArray(attributes)) {
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

    // 🔹 Save variations
    if (product_type === "variable" && Array.isArray(variations)) {
      for (const v of variations) {
        const validVariationImages = (v.images || [])
          .map((img) => img?._id)
          .filter(Boolean);

        const foundVariationImages = await Media.find({
          _id: { $in: validVariationImages },
        }).select("_id");

        // 🔹 Validate and generate combination key
        const attrs = Array.isArray(v.attributes) ? v.attributes : [];
        if (attrs.length === 0) continue;

        const keyParts = attrs
          .map((a) => `${a.attribute_id.toString()}:${a.value_id.toString()}`)
          .sort();

        const combination_key = keyParts.join("|");

        // 🔹 Check for duplicate combination
        const existing = await ProductVariation.findOne({
          product_id: product._id,
          combination_key,
        });

        if (existing) {
          throw new StatusError(
            `Duplicate variation with combination: ${combination_key}`,
            400
          );
        }

        const variation = new ProductVariation({
          product_id: product._id,
          sku: v.sku,
          combination_key, // 👈 new field
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
          visible_in_list: v.visible_in_list || false,
          attributes: v.attributes || [],
          images: foundVariationImages.map((m) => m._id),
          power_level: v.power_level || 0,
          rarity: v.rarity || "",
          status: "active",
          created_by: req.auth.user_id,
        });

        await variation.save();
      }
    }
    const specificationsDelete = await ProductSpecification.deleteMany({
      product_id: product._id,
    });
    // Add new specifications in bulk
    if (specifications.length > 0) {
      const specsToInsert = specifications.map((spec) => ({
        product_id: product._id,
        specification_id: spec.specification_id,
        value: spec.value || "",
        key: spec.key || "",
        label: spec.label || "",
        status: "active",
        created_by: req.auth.user_id,
      }));
      await ProductSpecification.insertMany(specsToInsert);
    }
    // ✅ Final response
    res.status(201).json({
      status: "success",
      message: req.__("Product added successfully"),
      data: new ProductResource(product).exec(),
    });
  } catch (error) {
    next(error);
  }
};
