import Page from "../../../models/Page.js";
import { StatusError } from "../../../config/index.js";
import PageResource from "../../../resources/PageResource.js";

/**
 * Edit Page
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Page ID is required"));
    }

    // Find the existing category
    const category = await Page.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Page not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the category
    const updatedCategory = await Page.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Page Deleted successfully"),
      data: new PageResource(updatedCategory).exec(),
    });
  } catch (error) {
    next(error);
  }
};
