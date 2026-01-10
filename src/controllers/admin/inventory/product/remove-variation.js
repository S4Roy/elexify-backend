import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Edit ProductVariation
 * @param req
 * @param res
 * @param next
 */
export const removeVariation = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Product Variation ID is required"));
    }

    // Find the existing fetchItem
    const fetchItem = await ProductVariation.findById(_id).exec();
    if (!fetchItem) {
      throw StatusError.notFound(req.__("Product Variation not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the fetchItem
    const updatedItem = await ProductVariation.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("ProductVariation Deleted successfully"),
      data: updatedItem,
    });
  } catch (error) {
    next(error);
  }
};
