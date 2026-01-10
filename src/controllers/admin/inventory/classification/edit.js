import Classification from "../../../../models/Classification.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import ClassificationResource from "../../../../resources/ClassificationResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Classification
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, name, description, parent_classification, status } = req.body;
    const image = req?.files?.image ?? null; // Get uploaded file (Single)

    if (!_id) {
      throw StatusError.badRequest(req.__("Classification ID is required"));
    }

    // Find the existing category
    const category = await Classification.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Classification not found"));
    }

    // Generate new slug only if the name has changed
    let slug = category.slug;
    if (name && name !== category.name) {
      slug = generalHelper.generateSlugName(name);

      // Check if another category with the same slug exists
      let existingCategory = await Classification.findOne({
        slug,
        _id: { $ne: _id },
      }).exec();
      let count = 1;

      // Regenerate slug if a duplicate is found
      while (existingCategory) {
        slug = generalHelper.generateSlugName(`${name}-${count}`);
        existingCategory = await Classification.findOne({
          slug,
          _id: { $ne: _id },
        }).exec();
        count++;
      }
    }

    // Prepare update data
    let sanitizedParentCategory = null;

    if (
      parent_classification !== undefined &&
      parent_classification !== null &&
      parent_classification !== "" &&
      parent_classification !== "null" &&
      generalHelper.sanitizeObjectId(parent_classification)
    ) {
      sanitizedParentCategory = generalHelper.sanitizeObjectId(
        parent_classification
      );
    }

    const updateData = {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(description !== undefined && { description: description || null }),
      ...(status !== undefined && { status }),
      ...(sanitizedParentCategory !== null && {
        parent_classification: sanitizedParentCategory,
      }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    // Handle image upload if a new image is provided
    if (image) {
      const key = `classifications/${slug}${path.extname(image.name)}`;
      const s3Upload = await s3Handler.uploadToS3(image, key);
      if (!s3Upload) {
        throw StatusError.badRequest(
          req.__("Classification image upload failed")
        );
      }
      // Create Media record
      const media = new Media({
        reference_id: null, // To be updated later
        reference_type: "classifications",
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
    const updatedCategory = await Classification.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Classification updated successfully"),
      data: new ClassificationResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
