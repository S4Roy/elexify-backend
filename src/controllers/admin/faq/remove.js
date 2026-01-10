import FAQ from "../../../models/FAQ.js";
import { StatusError } from "../../../config/index.js";
import FaqResource from "../../../resources/FaqResource.js";

/**
 * Edit FAQ
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("FAQ ID is required"));
    }

    // Find the existing itemExist
    const itemExist = await FAQ.findById(_id).exec();
    if (!itemExist) {
      throw StatusError.notFound(req.__("FAQ not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the itemExist
    const updatedModel = await FAQ.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("FAQ Deleted successfully"),
      data: new FaqResource(updatedModel).exec(),
    });
  } catch (error) {
    next(error);
  }
};
