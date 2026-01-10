import Rating from "../../../models/Rating.js";
import { StatusError } from "../../../config/index.js";
import RatingResource from "../../../resources/RatingResource.js";

/**
 * Delete Rating
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Rating ID is required"));
    }

    // Find the existing rating
    const rating = await Rating.findById(_id).exec();
    if (!rating) {
      throw StatusError.notFound(req.__("Rating not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the rating
    const uupdatedRating = await Rating.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Rating Deleted successfully"),
      data: new RatingResource(uupdatedRating).exec(),
    });
  } catch (error) {
    next(error);
  }
};
