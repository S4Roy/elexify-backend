import Classification from "../../../../models/Classification.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import ClassificationResource from "../../../../resources/ClassificationResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Classification
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Classification ID is required"));
    }

    // Find the existing category
    const category = await Classification.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Classification not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the category
    const updatedCategory = await Classification.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Classification Deleted successfully"),
      data: new ClassificationResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
