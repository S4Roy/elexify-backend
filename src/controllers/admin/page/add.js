import Page from "../../../models/Page.js";
import { StatusError } from "../../../config/index.js";

/**
 * Add or Update Page by slug
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { slug, title, content ,extra} = req.body;

    if (!slug) {
      throw StatusError.badRequest("Slug is required.");
    }

    const trimmedSlug = slug.trim();

    // Check if page with the slug already exists
    const existingPage = await Page.findOne({ slug: trimmedSlug });

    if (existingPage) {
      // 🔹 Update
      existingPage.title = title || existingPage.title;
      existingPage.content = content || existingPage.content;
      existingPage.updated_by = req.auth?.user_id || null;
      existingPage.updated_at = new Date();
      existingPage.extra = extra || existingPage.extra;

      await existingPage.save();

      return res.status(200).json({
        status: "success",
        message: req.__("Page updated successfully"),
        data: existingPage,
      });
    } else {
      // 🔹 Create
      const newPage = new Page({
        extra,
        slug: trimmedSlug,
        title,
        content,
        created_by: req.auth?.user_id || null,
        created_at: new Date(),
      });

      await newPage.save();

      return res.status(201).json({
        status: "success",
        message: req.__("Page added successfully"),
        data: newPage,
      });
    }
  } catch (error) {
    console.log(error);
    next(error);
  }
};
