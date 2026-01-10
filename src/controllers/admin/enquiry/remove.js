import Enquiry from "../../../models/Enquiry.js";
import { StatusError } from "../../../config/index.js";
import EnquiryResource from "../../../resources/EnquiryResource.js";

/**
 * Delete Enquiry
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Enquiry ID is required"));
    }

    // Find the existing rating
    const rating = await Enquiry.findById(_id).exec();
    if (!rating) {
      throw StatusError.notFound(req.__("Enquiry not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the rating
    const uupdatedRating = await Enquiry.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Enquiry Deleted successfully"),
      data: new EnquiryResource(uupdatedRating).exec(),
    });
  } catch (error) {
    next(error);
  }
};
