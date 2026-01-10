import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import path from "path";
import MediaResource from "../../../resources/MediaResource.js";

/**
 * Add Media File
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { ref_type } = req.body;
    const file = req?.files?.file ?? null;

    if (!ref_type || !file) {
      throw StatusError.badRequest("Reference type and file are required.");
    }

    const ext = path.extname(file.name); // .jpg, .png, etc.
    const timestamp = Date.now();
    const safeName = file.name.replace(/\s+/g, "_").toLowerCase();
    const key = `${ref_type}/${timestamp}_${safeName}`;

    // Upload to S3
    const s3Upload = await s3Handler.uploadToS3(file, key);
    if (!s3Upload) {
      throw StatusError.badRequest(req.__("File upload failed"));
    }

    // Save Media Record
    const media = new Media({
      reference_id: null,
      reference_type: ref_type,
      alt_text: file.name,
      url: key,
      type: "image",
      status: "active",
      created_by: req.auth.user_id,
    });

    await media.save();

    res.status(201).json({
      status: "success",
      message: req.__("Media added successfully"),
      data: new MediaResource(media).exec(),
    });
  } catch (error) {
    next(error);
  }
};
