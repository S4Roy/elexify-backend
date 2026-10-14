import Product from "../../../../models/Product.js";
import { toMetaText } from "../../../../services/seo/textUtils.js";
import { inRequestedOrder } from "../../../../services/media/orderedMedia.js";
import { hsnOrNull } from "../../../../services/inventory/product/hsn.js";
import ProductAttribute from "../../../../models/ProductAttribute.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Media from "../../../../models/Media.js";
import SEO from "../../../../models/SEO.js";
import ProductResource from "../../../../resources/ProductResource.js";
import { generalHelper } from "../../../../helpers/index.js";
import { scheduleGoogleFeedRegeneration } from "../../../../services/inventory/product/googleFeedService.js";
import { stockService } from "../../../../services/index.js";
import { stockSettings } from "../../../../services/stock/settings.js";


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
      is_featured,
      is_bestseller,
      weight,
      length,
      width,
      height,
      shipping_class,
      cod_status = "use_global",
      prepaid_only = false,
      quantity_discounts = [],

      regular_price,
      sale_price,
      sale_start_date,
      sale_end_date,
      sku,
      hsn_sac,
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
      while (await Product.exists({ $or: [{ slug }, { legacy_slugs: slug }], _id: { $ne: _id } })) {
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
    if (product.slug && slug !== product.slug) {
      product.legacy_slugs = [...new Set([...(product.legacy_slugs || []), product.slug])];
    }
    // 🔹 Update product fields
    Object.assign(product, {
      name,
      power_level,
      rarity,
      slug,
      ask_for_price,
      enable_enquiry,
      is_featured,
      is_bestseller,
      type: product_type,
      description: description || null,
      short_description: short_description || null,
      brand,
      categories: categoryArray,
      sub_categories: subCategoryArray,
      tags: tagsArray,
      classifications: classificationsArray,
      images: inRequestedOrder(mediaIds, validMediaDocs),
      status,
      weight,
      dimensions: { length, width, height },
      shipping_class: shipping_class || null,
      cod_status,
      prepaid_only,
      quantity_discounts,

      regular_price: product_type === "simple" ? regular_price : undefined,
      sale_price: product_type === "simple" ? sale_price : undefined,
      sale_start_date: product_type === "simple" ? sale_start_date : undefined,
      sale_end_date: product_type === "simple" ? sale_end_date : undefined,
      sku: product_type === "simple" ? sku : undefined,
      // Stock levels are never written here — on-hand only changes through
      // services/stock (POST /admin/inventory/stock/adjust), so a sale made
      // while this form was open can't be overwritten. stock_status is
      // derived on save.
      ...stockSettings(req.body),
      sold_individually,
      updated_by: req.auth.user_id,
    });
    // Only when sent, so a client without the field keeps a code set from Zoho Books settings.
    if (hsn_sac !== undefined) product.hsn_sac = hsnOrNull(hsn_sac) ?? undefined;

    await product.save();

    // 🔹 Update SEO
    if (product.seo) {
      await SEO.findByIdAndUpdate(product.seo, {
        // Plain text only: an empty meta description used to copy the HTML product description verbatim.
        meta_title: toMetaText(meta_title || name, 60),
        meta_description: toMetaText(meta_description || description, 160),
        meta_keywords: meta_keywords ? meta_keywords.split(",") : [],
        canonical_url: `/product/${slug}/`,
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
          // Blank means the variation uses the product's HSN code.
          ...(v.hsn_sac !== undefined ? { hsn_sac: hsnOrNull(v.hsn_sac) } : {}),
          power_level: v.power_level || 0,
          rarity: v.rarity || "",
          combination_key,
          visible_in_list: v.visible_in_list || false,
          ask_for_price: v.ask_for_price || false,
          enable_enquiry: v.enable_enquiry || false,
          regular_price: v.regular_price,
          sale_price: v.sale_price || null,
          ...stockSettings(v),
          weight: v.weight || 0,
          dimensions: {
            length: v.length || 0,
            width: v.width || 0,
            height: v.height || 0,
          },
          shipping_class: v.shipping_class || null,
          cod_status: v.cod_status || "use_global",
          prepaid_only: Boolean(v.prepaid_only),
          attributes: v.attributes || [],
          images: inRequestedOrder(validVariationImages, foundVariationImages),
          status: "active",
          deleted_at: null, // reset if it was soft-deleted earlier
          updated_by: req.auth.user_id,
        };

        if (v._id && /^[0-9a-fA-F]{24}$/.test(v._id)) {
          // Update existing variation
          await ProductVariation.findByIdAndUpdate(v._id, variationData);
          await stockService.refreshStockStatus({ product: product._id, variation: v._id });
        } else {
          // Create new variation; its starting quantity is booked as an
          // opening balance in the stock ledger.
          const newVariation = new ProductVariation({
            ...variationData,
            stock_quantity: 0,
            created_by: req.auth.user_id,
          });
          await newVariation.save();
          await stockService.recordOpeningStock({
            product: product._id, variation: newVariation._id, quantity: v.stock_quantity,
            actor: { type: "admin", id: req.auth.user_id },
          });
        }
      }
      await stockService.refreshParentStatus(product._id);
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

    scheduleGoogleFeedRegeneration();

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
