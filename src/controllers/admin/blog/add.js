import Blog from "../../../models/Blog.js";
import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import BlogResource from "../../../resources/BlogResource.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Add Blog
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      title,
      short_description,
      feature_image,
      content,
      tags,
      related_blogs,
    } = req.body;
    let slug = generalHelper.generateSlugName(title);
    let existingBlog = await Blog.findOne({ slug }).exec();
    let count = 1;

    while (existingBlog) {
      slug = generalHelper.generateSlugName(`${title}-${count}`);
      existingBlog = await Blog.findOne({ slug }).exec();
      count++;
    }
    // Basic guard (in case validation layer was bypassed)
    if (!title || !String(title).trim()) {
      throw StatusError.badRequest(req.__("Title is required"));
    }
    // Create blog
    const blog = new Blog({
      title,
      slug,
      tags,
      related_blogs,
      short_description: short_description || "",
      content: content || "",
      feature_image: feature_image, // ObjectId or null
      status: "active", // or trust body if you allow setting it on create
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    await blog.save();

    // Back-reference media to blog
    if (feature_image) {
      await Media.updateOne(
        { _id: feature_image },
        { $set: { reference_id: blog._id } }
      );
    }

    // Response
    res.status(201).json({
      status: "success",
      message: req.__("Blog added successfully"),
      data: new BlogResource(blog).exec(),
    });
  } catch (error) {
    next(error);
  }
};
