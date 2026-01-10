import Category from "../../../models/Category.js";
import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import path from "path";
import CategoryResource from "../../../resources/CategoryResource.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Edit Category
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, name, description, parent_category, status } = req.body;
    const image = req?.files?.image ?? null; // Get uploaded file (Single)

    if (!_id) {
      throw StatusError.badRequest(req.__("Category ID is required"));
    }

    // Find the existing category
    const category = await Category.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Category not found"));
    }

    // Generate new slug only if the name has changed
    let slug = category.slug;
    if (name && name !== category.name) {
      slug = generalHelper.generateSlugName(name);

      // Check if another category with the same slug exists
      let existingCategory = await Category.findOne({
        slug,
        _id: { $ne: _id },
      }).exec();
      let count = 1;

      // Regenerate slug if a duplicate is found
      while (existingCategory) {
        slug = generalHelper.generateSlugName(`${name}-${count}`);
        existingCategory = await Category.findOne({
          slug,
          _id: { $ne: _id },
        }).exec();
        count++;
      }
    }

    // Prepare update data
    let sanitizedParentCategory = null;

    if (
      parent_category !== undefined &&
      parent_category !== null &&
      parent_category !== "" &&
      parent_category !== "null" &&
      generalHelper.sanitizeObjectId(parent_category)
    ) {
      sanitizedParentCategory = generalHelper.sanitizeObjectId(parent_category);
    }

    const updateData = {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(description !== undefined && { description: description || null }),
      ...(status !== undefined && { status }),
      ...(sanitizedParentCategory !== null && {
        parent_category: sanitizedParentCategory,
      }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    // Handle image upload if a new image is provided
    if (image) {
      const key = `categories/${slug}${path.extname(image.name)}`;
      const s3Upload = await s3Handler.uploadToS3(image, key);
      if (!s3Upload) {
        throw StatusError.badRequest(req.__("Category image upload failed"));
      }
      // Create Media record
      const media = new Media({
        reference_id: null, // To be updated later
        reference_type: "categories",
        alt_text: image.name,
        url: key,
        type: "image",
        status: "active",
        created_by: req.auth.user_id,
      });
      await media.save();
      updateData.image = media?._id;
    }

    // Update the category
    const updatedCategory = await Category.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Category updated successfully"),
      data: new CategoryResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
