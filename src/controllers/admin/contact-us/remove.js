import ContactUs from "../../../models/ContactUs.js";
import { StatusError } from "../../../config/index.js";
import RatingResource from "../../../resources/RatingResource.js";

/**
 * Delete ContactUs
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("ContactUs ID is required"));
    }

    // Find the existing rating
    const rating = await ContactUs.findById(_id).exec();
    if (!rating) {
      throw StatusError.notFound(req.__("ContactUs not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the rating
    const uupdatedRating = await ContactUs.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("ContactUs Deleted successfully"),
      data: new RatingResource(uupdatedRating).exec(),
    });
  } catch (error) {
    next(error);
  }
};
