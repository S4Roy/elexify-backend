import Blog from "../../../models/Blog.js";
import { StatusError } from "../../../config/index.js";
import BlogResource from "../../../resources/BlogResource.js";

/**
 * Edit Blog
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Blog ID is required"));
    }

    // Find the existing category
    const category = await Blog.findById(_id).exec();
    if (!category) {
      throw StatusError.notFound(req.__("Blog not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the category
    const updatedItem = await Blog.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Blog Deleted successfully"),
      data: new BlogResource(updatedItem).exec(),
    });
  } catch (error) {
    next(error);
  }
};
