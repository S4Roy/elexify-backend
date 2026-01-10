import Banner from "../../../models/Banner.js";
import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import path from "path";
import BannerResource from "../../../resources/BannerResource.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Edit Banner
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, title, description, cta_label, cta_link, status } = req.body;

    // Normalize uploaded file (may be single or array from your uploader)
    const imageInput = req?.files?.image ?? null;
    const imageFile = Array.isArray(imageInput) ? imageInput[0] : imageInput;

    if (!_id) {
      throw StatusError.badRequest(req.__("Banner ID is required"));
    }

    // Load existing banner
    const banner = await Banner.findById(_id).exec();
    if (!banner) {
      throw StatusError.notFound(req.__("Banner not found"));
    }

    // Build update payload (only set provided fields)
    const updateData = {
      ...(title !== undefined && { title: String(title).trim() }),
      ...(description !== undefined && { description: description || "" }),
      ...(cta_label !== undefined && { cta_label: cta_label || "" }),
      ...(cta_link !== undefined && { cta_link: cta_link || null }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      // updated_at is auto via timestamps
    };

    // Handle image upload (optional)
    if (imageFile) {
      const originalName =
        imageFile.name || imageFile.originalname || "banner-image";
      const ext = path.extname(originalName).toLowerCase();

      // Use new title if provided, else existing banner title
      const baseTitle = updateData.title || banner.title || "banner";
      const safeTitle = generalHelper?.slugify
        ? generalHelper.slugify(String(baseTitle))
        : String(baseTitle)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");

      const key = `banners/${safeTitle}-${Date.now()}${ext}`;

      const s3Upload = await s3Handler.uploadToS3(imageFile, key);
      if (!s3Upload) {
        throw StatusError.badRequest(req.__("Banner image upload failed"));
      }

      // Create Media record linked to this banner
      const media = new Media({
        reference_id: banner._id,
        reference_type: "banners",
        alt_text: baseTitle,
        url: key, // store S3 key; FE can resolve to full URL
        type: "image",
        status: "active",
        created_by: req.auth.user_id,
      });
      await media.save();

      updateData.image = media._id;
    }

    // Update and return
    const updatedBanner = await Banner.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Banner updated successfully"),
      data: new BannerResource(updatedBanner).exec(),
    });
  } catch (error) {
    next(error);
  }
};
