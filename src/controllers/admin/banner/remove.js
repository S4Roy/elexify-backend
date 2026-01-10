import Banner from "../../../models/Banner.js";
import { StatusError } from "../../../config/index.js";
import BannerResource from "../../../resources/BannerResource.js";

/**
 * Edit Banner
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Banner ID is required"));
    }

    // Find the existing category
    const category = await Banner.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Banner not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the category
    const updatedCategory = await Banner.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Banner Deleted successfully"),
      data: new BannerResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
