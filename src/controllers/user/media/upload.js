import fs from "fs";
import os from "os";
import path from "path";
import mime from "mime-types";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import MediaResource from "../../../resources/MediaResource.js";

ffmpeg.setFfmpegPath(ffmpegStatic);

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const ALLOWED_VIDEO_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

const MAX_FILES = 5;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// Extracts a frame ~1s into the clip as a poster image, matching how
// YouTube/Instagram-style upload flows show a static thumbnail before the
// video plays. ffmpeg needs a real file on disk to read from, so the
// in-memory buffer express-fileupload gives us is written to a temp file
// first (and always cleaned up, even on failure).
async function generateVideoThumbnail(buffer, safeName, timestamp) {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `${timestamp}_${safeName}`);
  const thumbName = `${timestamp}_thumb_${safeName}.jpg`;
  const thumbPath = path.join(tmpDir, thumbName);

  await fs.promises.writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on("end", resolve)
        .on("error", reject)
        .screenshots({
          count: 1,
          timestamps: ["1"],
          filename: thumbName,
          folder: tmpDir,
          size: "640x?",
        });
    });

    return await fs.promises.readFile(thumbPath);
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
    await fs.promises.unlink(thumbPath).catch(() => {});
  }
}

/**
 * Upload one or more images/videos (e.g. product review attachments).
 * @param req
 * @param res
 * @param next
 */
export const upload = async (req, res, next) => {
  try {
    const rawFiles = req?.files?.files ?? null;
    if (!rawFiles) {
      throw StatusError.badRequest("At least one file is required.");
    }
    const files = Array.isArray(rawFiles) ? rawFiles : [rawFiles];

    if (files.length > MAX_FILES) {
      throw StatusError.badRequest(
        `You can attach up to ${MAX_FILES} files at a time.`
      );
    }

    const created = [];

    for (const file of files) {
      const mimetype =
        file.mimetype || file.type || mime.lookup(file.name) || "";
      const isImage = mimetype.startsWith("image/");
      const isVideo = mimetype.startsWith("video/");

      if (!isImage && !isVideo) {
        throw StatusError.badRequest(`Unsupported media type: ${file.name}`);
      }
      if (isImage && !ALLOWED_IMAGE_MIMES.includes(mimetype)) {
        throw StatusError.badRequest(`Unsupported image format: ${file.name}`);
      }
      if (isVideo && !ALLOWED_VIDEO_MIMES.includes(mimetype)) {
        throw StatusError.badRequest(`Unsupported video format: ${file.name}`);
      }

      const size = file.size ?? file.data?.length ?? 0;
      if (isImage && size > MAX_IMAGE_SIZE) {
        throw StatusError.badRequest(`Image too large (max 8MB): ${file.name}`);
      }
      if (isVideo && size > MAX_VIDEO_SIZE) {
        throw StatusError.badRequest(`Video too large (max 50MB): ${file.name}`);
      }

      const timestamp = Date.now();
      const safeName = file.name
        .replace(/\s+/g, "_")
        .toLowerCase()
        .replace(/[^a-z0-9_\-\.]/g, "");
      const key = `ratings/${timestamp}_${safeName}`;

      const s3Upload = await s3Handler.uploadToS3(file, key);
      if (!s3Upload) {
        throw StatusError.badRequest(req.__("File upload failed"));
      }

      let thumbnailKey = null;
      if (isVideo) {
        try {
          const thumbBuffer = await generateVideoThumbnail(
            file.data,
            safeName,
            timestamp
          );
          const thumbKeyName = `ratings/thumbs/${timestamp}_thumb_${safeName}.jpg`;
          await s3Handler.uploadToS3(
            { data: thumbBuffer, mimetype: "image/jpeg" },
            thumbKeyName
          );
          thumbnailKey = thumbKeyName;
        } catch (thumbErr) {
          // A missing poster frame shouldn't block the video upload itself.
          console.warn("Video thumbnail generation failed:", thumbErr);
          thumbnailKey = null;
        }
      }

      const media = new Media({
        reference_id: null,
        reference_type: "ratings",
        alt_text: file.name,
        url: key,
        type: isImage ? "image" : "video",
        mime_type: mimetype,
        size: size,
        thumbnail: thumbnailKey,
        status: "active",
        created_by: req.auth.user_id,
      });

      await media.save();
      created.push(media);
    }

    res.status(201).json({
      status: "success",
      message: req.__("Media uploaded successfully"),
      data: MediaResource.collection(created),
    });
  } catch (error) {
    next(error);
  }
};
