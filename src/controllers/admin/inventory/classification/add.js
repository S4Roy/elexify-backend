import Classification from "../../../../models/Classification.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import ClassificationResource from "../../../../resources/ClassificationResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Classification
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { name, description = "", parent_classification, status } = req.body;
    const image = req?.files?.image ?? null; // Get uploaded file (Single)
    // Generate a unique slug
    let slug = generalHelper.generateSlugName(name);
    let existiingItem = await Classification.findOne({ slug }).exec();
    let count = 1;

    while (existiingItem) {
      slug = generalHelper.generateSlugName(`${name}-${count}`);
      existiingItem = await Classification.findOne({ slug }).exec();
      count++;
    }

    // Upload image if provided
    let media_id = null;
    if (image) {
      let key = `classifications/${slug}${path.extname(image.name)}`;
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
      media_id = media?._id;
    }

    // Create new category
    const category = new Classification({
      name,
      slug,
      description: description || null,
      parent_classification:
        generalHelper.sanitizeObjectId(parent_classification) || null,
      image: media_id,
      status: status || "active",
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    // Save category
    await category.save();
    if (media_id) {
      await Media.updateMany(
        { _id: { $in: [media_id] } },
        { reference_id: category._id }
      );
    }
    // Success Response
    res.status(201).json({
      status: "success",
      message: req.__("Classification added successfully"),
      data: new ClassificationResource(category).exec(),
    });
  } catch (error) {
    next(error);
  }
};
