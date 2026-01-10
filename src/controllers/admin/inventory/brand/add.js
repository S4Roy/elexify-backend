import Brand from "../../../../models/Brand.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import CategoryResource from "../../../../resources/CategoryResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Brand
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { name, description = "", parent_brand, status } = req.body;
    const image = req?.files?.image ?? null; // Get uploaded file (Single)
    // Generate a unique slug
    let slug = generalHelper.generateSlugName(name);
    let existingData = await Brand.findOne({ slug }).exec();
    let count = 1;

    while (existingData) {
      slug = generalHelper.generateSlugName(`${name}-${count}`);
      existingData = await Brand.findOne({ slug }).exec();
      count++;
    }

    // Upload image if provided
    let media_id = null;
    if (image) {
      let key = `brands/${slug}${path.extname(image.name)}`;
      const s3Upload = await s3Handler.uploadToS3(image, key);
      if (!s3Upload) {
        throw StatusError.badRequest(req.__("Brand image upload failed"));
      }
      // Create Media record
      const media = new Media({
        reference_id: null, // To be updated later
        reference_type: "brands",
        alt_text: image.name,
        url: key,
        type: "image",
        status: "active",
        created_by: req.auth.user_id,
      });
      await media.save();
      media_id = media?._id;
    }

    // Create new brand
    const brand = new Brand({
      name,
      slug,
      description: description || null,
      parent_brand: generalHelper.sanitizeObjectId(parent_brand) || null,
      image: media_id,
      status: status || "active",
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    // Save brand
    await brand.save();
    if (media_id) {
      await Media.updateMany(
        { _id: { $in: [media_id] } },
        { reference_id: brand._id }
      );
    }
    // Success Response
    res.status(201).json({
      status: "success",
      message: req.__("Brand added successfully"),
      data: new CategoryResource(brand).exec(),
    });
  } catch (error) {
    next(error);
  }
};
