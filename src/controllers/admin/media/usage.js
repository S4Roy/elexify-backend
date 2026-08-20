import { StatusError } from "../../../config/index.js";
import { getMediaUsage, toMediaObjectId } from "../../../helpers/media/getMediaUsage.js";

/**
 * Media Usage — reports which live documents currently reference a given
 * Media _id, so the admin can see "where is this used" before reusing or
 * deleting an image.
 */
export const usage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const mediaId = toMediaObjectId(id);
    if (!mediaId) {
      throw StatusError.badRequest(req.__("Invalid media id"));
    }

    const items = await getMediaUsage(mediaId);

    res.status(200).json({
      status: "success",
      message: req.__("Usage fetched successfully"),
      data: { count: items.length, items },
    });
  } catch (error) {
    next(error);
  }
};
