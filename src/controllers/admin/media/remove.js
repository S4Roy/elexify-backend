import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import MediaResource from "../../../resources/MediaResource.js";

/**
 * Edit Media
 * @param req
 * @param res
 * @param next
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
