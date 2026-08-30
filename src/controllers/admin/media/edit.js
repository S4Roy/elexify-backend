import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { s3Handler } from "../../../services/s3Handler/s3Handler.js";
import MediaResource from "../../../resources/MediaResource.js";
import mime from "mime-types";
import { validateMediaUpload } from "../../../helpers/validateMediaUpload.js";

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/webm"];

/**
 * Edit Media — update alt text and/or replace the file (e.g. after
 * cropping). A replacement upload reuses the EXISTING S3 key so every
 * document/order/etc. already pointing at this media's url picks up the
 * new file automatically, instead of orphaning the old object.
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, alt_text } = req.body;
    const file = req?.files?.file ?? null;

    const media = await Media.findOne({ _id, deleted_at: null }).exec();
    if (!media) {
      throw StatusError.notFound(req.__("Media not found"));
    }

    const updateData = {
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    if (typeof alt_text === "string") {
      updateData.alt_text = alt_text;
    }

    if (file) {
      const validated = await validateMediaUpload(file);
      const mimetype = validated.mime;
      const allowed =
        media.type === "video" ? ALLOWED_VIDEO_MIMES : ALLOWED_IMAGE_MIMES;
      if (!allowed.includes(mimetype)) {
        throw StatusError.badRequest(
          req.__(
            media.type === "video"
              ? "Unsupported video format."
              : "Unsupported image format."
          )
        );
      }

      // Replace the object in place — same key as the existing media.url —
      // so every reference to this media picks up the new file for free.
      await s3Handler.uploadToS3(file, media.url);

      updateData.mime_type = mimetype;
      updateData.size = file.size ?? file.data?.length ?? media.size;
    }

    const updated = await Media.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Media updated successfully"),
      data: new MediaResource(updated).exec(),
    });
  } catch (error) {
    next(error);
  }
};
