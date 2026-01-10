import Category from "../../../../models/Category.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import CategoryResource from "../../../../resources/CategoryResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Category
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      name,
      description = "",
      parent_category,
      status,
      image,
      banner,
      banner_tag_line,
      details,
    } = req.body;
    // Generate a unique slug
    let slug = generalHelper.generateSlugName(name);
    let existingCategory = await Category.findOne({ slug }).exec();
    let count = 1;

    while (existingCategory) {
      slug = generalHelper.generateSlugName(`${name}-${count}`);
      existingCategory = await Category.findOne({ slug }).exec();
      count++;
    }

    // Create new category
    const category = new Category({
      name,
      slug,
      description: description || "",
      banner_tag_line: banner_tag_line || "",
      parent_category: generalHelper.sanitizeObjectId(parent_category) || null,
      image: generalHelper.sanitizeObjectId(image) || null,
      banner: generalHelper.sanitizeObjectId(banner) || null,
      details,
      status: status || "active",
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    // Save category
    await category.save();

    // Success Response
    res.status(201).json({
      status: "success",
      message: req.__("Category added successfully"),
      data: new CategoryResource(category).exec(),
    });
  } catch (error) {
    next(error);
  }
};
