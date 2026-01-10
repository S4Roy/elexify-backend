import Product from "../../../../models/Product.js";
import Media from "../../../../models/Media.js";
import SEO from "../../../../models/SEO.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import ProductResource from "../../../../resources/ProductResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Product
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const {
      _id,
      name,
      description,
      category,
      status,
      meta_title,
      meta_description,
      meta_keywords,
      remove_images = [], // Array of media IDs to remove
    } = req.body;
    const images = req?.files?.images ?? [];

    if (!_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    // Find the existing category
    const product = await Product.findById(_id).exec();
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    // Generate new slug only if the name has changed
    let slug = product.slug;
    if (name && name !== product.name) {
      slug = generalHelper.generateSlugName(name);

      // Check if another category with the same slug exists
      let existingProduct = await Product.findOne({
        slug,
        _id: { $ne: _id },
      }).exec();
      let count = 1;

      // Regenerate slug if a duplicate is found
      while (existingProduct) {
        slug = generalHelper.generateSlugName(`${name}-${count}`);
        existingProduct = await Product.findOne({
          slug,
          _id: { $ne: _id },
        }).exec();
        count++;
      }
    }

    // Prepare update data
    const updateData = {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(description !== undefined && { description: description || null }),
      ...(category !== undefined && {
        category: category || null,
      }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    let mediaIds = product.images || [];
    // 🔹 Remove Selected Images
    if (remove_images.length > 0) {
      await Media.updateMany({
        _id: { $in: remove_images },
        deleted_at: new Date(),
        deleted_by: req.auth.user_id,
      });
      mediaIds = mediaIds.filter(
        (id) => !remove_images.includes(id.toString())
      );
    }
    if (Array.isArray(images) && images.length > 0) {
      for (const image of images) {
        const key = `products/${slug}-${Date.now()}${path.extname(image.name)}`;
        const s3Upload = await s3Handler.uploadToS3(image, key);
        if (!s3Upload)
          throw StatusError.badRequest(req.__("Product image upload failed"));

        // Create Media record
        const media = new Media({
          reference_id: product._id,
          reference_type: "products",
          url: key,
          type: "image",
          status: "active",
          created_by: req.auth.user_id,
        });
        await media.save();
        mediaIds.push(media._id);
      }
    }
    if (mediaIds.length > 0) {
      updateData.images = mediaIds;
    }
    // Update the category
    const updatedProduct = await Product.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );
    // 🔹 Update SEO (if exists)
    if (updatedProduct.seo) {
      const seoUpdateData = {
        ...(meta_title && { meta_title }),
        ...(meta_description && { meta_description }),
        ...(meta_keywords && { meta_keywords: meta_keywords.split(",") }),
        canonical_url: `/product/${slug}`,
        updated_by: req.auth.user_id,
        updated_at: new Date(),
      };

      await SEO.findByIdAndUpdate(updatedProduct.seo, { $set: seoUpdateData });
    }
    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Product updated successfully"),
      data: new ProductResource(updatedProduct).exec(),
    });
  } catch (error) {
    next(error);
  }
};
