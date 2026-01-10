import Brand from "../../../../models/Brand.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import CategoryResource from "../../../../resources/CategoryResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Brand
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Brand ID is required"));
    }

    // Find the existing brand
    const brand = await Brand.findById(_id).exec();
    if (!brand) {
      throw StatusError.notFound(req.__("Brand not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the brand
    const updateBrand = await Brand.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Brand Deleted successfully"),
      data: new CategoryResource(updateBrand).exec(),
    });
  } catch (error) {
    next(error);
  }
};
