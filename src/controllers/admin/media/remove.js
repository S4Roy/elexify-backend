import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import MediaResource from "../../../resources/MediaResource.js";
import { getMediaUsage } from "../../../helpers/media/getMediaUsage.js";

/**
 * Soft-delete Media — only allowed while the item isn't referenced by any
 * live Product/Category/Blog/etc. document. A daily cron permanently purges
 * (S3 + DB) anything left soft-deleted past the retention window.
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Media ID is required"));
    }

    // Find the existing media
    const media = await Media.findById(_id).exec();
    if (!media) {
      throw StatusError.notFound(req.__("Media not found"));
    }

    const usage = await getMediaUsage(media._id, { limit: 5 });
    if (usage.length) {
      const preview = usage
        .slice(0, 3)
        .map((u) => `${u.type}: ${u.label || "Untitled"}`)
        .join(", ");
      throw StatusError.badRequest(
        req.__(
          `Cannot delete — this media is still used in ${usage.length} place(s) (${preview}${usage.length > 3 ? ", ..." : ""}). Remove those references first.`
        )
      );
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the media
    const updatedCategory = await Media.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Media Deleted successfully"),
      data: new MediaResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
