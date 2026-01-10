import Banner from "../../../models/Banner.js";
import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import path from "path";
import BannerResource from "../../../resources/BannerResource.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Add Banner
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      title,
      description = "",
      cta_label = "",
      cta_link = null,
    } = req.body;

    // Basic guard (in case validation layer was bypassed)
    if (!title || !String(title).trim()) {
      throw StatusError.badRequest(req.__("Title is required"));
    }

    // Normalize uploaded file (single or array)
    const fileInput = req?.files?.image ?? null;
    const file = Array.isArray(fileInput) ? fileInput[0] : fileInput;

    // Prepare for media upload
    let media_id = null;

    if (file) {
      const originalName = file.name || file.originalname || "banner-image";
      const ext = path.extname(originalName).toLowerCase();

      // Build a clean S3 key: banners/<slugified-title>-<ts><ext>
      const safeTitle = generalHelper?.slugify
        ? generalHelper.slugify(String(title))
        : String(title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
      const key = `banners/${safeTitle}-${Date.now()}${ext}`;

      // Upload to S3 (expects your s3Handler to accept the file object + key)
      const s3Upload = await s3Handler.uploadToS3(file, key);
      if (!s3Upload) {
        throw StatusError.badRequest(req.__("Banner image upload failed"));
      }

      // Create Media record
      const media = new Media({
        reference_id: null, // set after banner is created
        reference_type: "banners",
        alt_text: title,
        url: key, // store S3 key; FE can resolve to full URL
        type: "image",
        status: "active", // <-- FIX: was `cta_link: "active"`
        created_by: req.auth.user_id,
      });
      await media.save();
      media_id = media._id;
    }

    // Create banner
    const banner = new Banner({
      title: String(title).trim(),
      description: description || "",
      cta_label: cta_label || "",
      cta_link: cta_link || null,
      image: media_id, // ObjectId or null
      status: "active", // or trust body if you allow setting it on create
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    await banner.save();

    // Back-reference media to banner
    if (media_id) {
      await Media.updateOne(
        { _id: media_id },
        { $set: { reference_id: banner._id } }
      );
    }

    // Response
    res.status(201).json({
      status: "success",
      message: req.__("Banner added successfully"),
      data: new BannerResource(banner).exec(),
    });
  } catch (error) {
    next(error);
  }
};
