import Testimonial from "../../../models/Testimonial.js";
import { StatusError } from "../../../config/index.js";
import TestimonialResource from "../../../resources/TestimonialResource.js";

/**
 * Edit Testimonial
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Testimonial ID is required"));
    }

    // Find the existing itemExist
    const itemExist = await Testimonial.findById(_id).exec();
    if (!itemExist) {
      throw StatusError.notFound(req.__("Testimonial not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the itemExist
    const updatedModel = await Testimonial.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Testimonial Deleted successfully"),
      data: new TestimonialResource(updatedModel).exec(),
    });
  } catch (error) {
    next(error);
  }
};
