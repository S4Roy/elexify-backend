import Blog from "../../../models/Blog.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import BlogResource from "../../../resources/BlogResource.js";
import mongoose from "mongoose";

/**
 * List Blog
 * @param req
 * @param res
 * @param next
 */
export const blog_filter_option = async (req, res, next) => {
  try {
    // --- Distinct Tags ---
    const tags = await Blog.distinct("tags", {
      deleted_at: null,
      status: "active",
    });

    // --- Newest Blogs (last 5) ---
    let newest = await Blog.find({ deleted_at: null, status: "active" })
      .sort({ created_at: -1 })
      .limit(5)
      .populate("feature_image")
      .populate("created_by")
      .lean();

    newest = await BlogResource.collection(newest);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: { tags, newest_blogs: newest },
    });
  } catch (error) {
    next(error);
  }
};
