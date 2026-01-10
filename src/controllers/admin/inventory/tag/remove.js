import Tag from "../../../../models/Tag.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import TagResource from "../../../../resources/TagResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Tag
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Tag ID is required"));
    }

    // Find the existing category
    const category = await Tag.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Tag not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the category
    const updatedCategory = await Tag.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Tag Deleted successfully"),
      data: new TagResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
