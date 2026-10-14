import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import path from "path";
import MediaResource from "../../../resources/MediaResource.js";
import mime from "mime-types"; // npm i mime-types
import { validateMediaUpload } from "../../../helpers/validateMediaUpload.js";

import { extensionFor, makeThumbnail, optimizeImage } from "../../../services/media/optimizeImage.js";

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
// GIF may be animated; a still JPEG preview would misrepresent it.
const isOptimizableForThumb = (type) => ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type);

const ALLOWED_VIDEO_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

/**
 * Add Media File
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { ref_type } = req.body;
    const file = req?.files?.file ?? null; // adapt if using multer (req.file) or other middleware

    if (!ref_type || !file) {
      throw StatusError.badRequest("Reference type and file are required.");
    }

    // determine mimetype & size (file object shape may vary by uploader)
    const validated = await validateMediaUpload(file);
    const mimetype = validated.mime;
    const size = validated.size;

    // detect type: image or video
    const isImage = mimetype.startsWith("image/");
    const isVideo = mimetype.startsWith("video/");

    if (!isImage && !isVideo) {
      throw StatusError.badRequest(
        "Unsupported media type. Only images and videos are allowed."
      );
    }

    // additional validation against allow-lists
    if (isImage && !ALLOWED_IMAGE_MIMES.includes(mimetype)) {
      throw StatusError.badRequest("Unsupported image format.");
    }
    if (isVideo && !ALLOWED_VIDEO_MIMES.includes(mimetype)) {
      throw StatusError.badRequest("Unsupported video format.");
    }

    // Resize/compress images before storing (≤1600px; JPEG, or PNG when transparent).
    const optimized = isImage ? await optimizeImage(file.data, mimetype) : { buffer: file.data, contentType: mimetype, changed: false };
    const storedMime = optimized.contentType;
    const storedSize = optimized.changed ? optimized.buffer.length : size;

    // build safe key and file name; the extension follows the stored format
    const timestamp = Date.now();
    let safeName = file.name
      .replace(/\s+/g, "_")
      .toLowerCase()
      .replace(/[^a-z0-9_\-\.]/g, "");
    const newExt = optimized.changed ? extensionFor(storedMime) : null;
    if (newExt) safeName = `${path.basename(safeName, path.extname(safeName))}${newExt}`;
    if (!path.extname(safeName)) safeName += `.${mime.extension(storedMime) || "bin"}`;
    const key = `${ref_type}/${timestamp}_${safeName}`;

    const s3Upload = await s3Handler.uploadToS3({ ...file, data: optimized.buffer, mimetype: storedMime }, key, { optimize: false });
    if (!s3Upload) {
      throw StatusError.badRequest(req.__("File upload failed"));
    }

    // Small JPEG preview for grids/lists. Video posters are not generated here.
    // A failed thumbnail never fails the upload.
    let thumbnailKey = null;
    if (isImage && isOptimizableForThumb(storedMime)) {
      try {
        const thumbBuffer = await makeThumbnail(optimized.buffer);
        const thumbKey = `${ref_type}/thumbs/${timestamp}_${path.basename(safeName, path.extname(safeName))}.jpg`;
        await s3Handler.uploadToS3({ data: thumbBuffer, mimetype: "image/jpeg" }, thumbKey, { optimize: false });
        thumbnailKey = thumbKey;
      } catch (thumbErr) {
        console.warn("Thumbnail generation failed:", thumbErr);
      }
    }

    // Save Media Record
    const media = new Media({
      reference_id: null,
      reference_type: ref_type,
      alt_text: file.name,
      url: key, // you may want to store s3Upload.Location or full URL depending on your resource/resolver
      type: isImage ? "image" : "video",
      mime_type: storedMime,
      size: storedSize,
      thumbnail: thumbnailKey, // null if not generated
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
