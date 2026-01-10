import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import path from "path";
import MediaResource from "../../../resources/MediaResource.js";
import mime from "mime-types"; // npm i mime-types

// OPTIONAL: uncomment / install these if you want thumbnails
// import sharp from "sharp";            // npm i sharp
// import ffmpeg from "fluent-ffmpeg";  // npm i fluent-ffmpeg  (requires ffmpeg binary installed)

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
];
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
    const mimetype = file.mimetype || file.type || mime.lookup(file.name) || "";
    const size = file.size ?? file.data?.length ?? null;

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

    // build safe key and file name
    const ext =
      path.extname(file.name) || `.${mime.extension(mimetype) || "bin"}`;
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/\s+/g, "_")
      .toLowerCase()
      .replace(/[^a-z0-9_\-\.]/g, "");
    const key = `${ref_type}/${timestamp}_${safeName}`;

    // Upload to S3 (assumes s3Handler.uploadToS3 accepts the same file object you pass today).
    // If your s3Handler expects a buffer/stream/path, adapt accordingly.
    const s3Upload = await s3Handler.uploadToS3(file, key);
    if (!s3Upload) {
      throw StatusError.badRequest(req.__("File upload failed"));
    }

    // Optional: generate thumbnails (image/video)
    // You can enable these blocks if you install & configure sharp / ffmpeg + fluent-ffmpeg.
    let thumbnailKey = null;
    try {
      // Example: image thumbnail using sharp (uncomment imports & install sharp)
      /*
      if (isImage) {
        // file.data (buffer) expected; if your uploader gives a tempFilePath, use fs.createReadStream(tempFilePath)
        const imgBuffer = file.data || (await fs.promises.readFile(file.tempFilePath));
        const thumbBuffer = await sharp(imgBuffer).resize({ width: 400 }).jpeg({ quality: 75 }).toBuffer();
        const thumbKeyName = `${ref_type}/thumbs/${timestamp}_thumb_${safeName}.jpg`;
        await s3Handler.uploadBufferToS3(thumbBuffer, thumbKeyName, 'image/jpeg');
        thumbnailKey = thumbKeyName;
      }
      */
      // Example: video thumbnail using ffmpeg (requires ffmpeg binary + fluent-ffmpeg)
      /*
      if (isVideo) {
        // if your uploader stores the file temporarily at file.tempFilePath use that path
        const inputPath = file.tempFilePath || (file.path); // adjust as needed
        if (inputPath) {
          const thumbLocalPath = `/tmp/${timestamp}_thumb.jpg`;
          await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
              .on("end", () => resolve(true))
              .on("error", (err) => reject(err))
              .screenshots({
                count: 1,
                timestamps: ["5%"],
                filename: path.basename(thumbLocalPath),
                folder: path.dirname(thumbLocalPath),
                size: "640x?",
              });
          });
          const thumbBuffer = await fs.promises.readFile(thumbLocalPath);
          const thumbKeyName = `${ref_type}/thumbs/${timestamp}_thumb_${safeName}.jpg`;
          await s3Handler.uploadBufferToS3(thumbBuffer, thumbKeyName, "image/jpeg");
          thumbnailKey = thumbKeyName;
          // optionally unlink tmp file
          await fs.promises.unlink(thumbLocalPath).catch(() => {});
        }
      }
      */
    } catch (thumbErr) {
      // thumbnail generation should not fail the upload — just log and continue
      console.warn("Thumbnail generation failed:", thumbErr);
      thumbnailKey = null;
    }

    // Save Media Record
    const media = new Media({
      reference_id: null,
      reference_type: ref_type,
      alt_text: file.name,
      url: key, // you may want to store s3Upload.Location or full URL depending on your resource/resolver
      type: isImage ? "image" : "video",
      mime_type: mimetype,
      size: size,
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
