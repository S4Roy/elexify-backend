import { buildCategoryListPipeline } from "../../../../services/inventory/category/buildCategoryListPipeline.js";
import Category from "../../../../models/Category.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
import mongoose from "mongoose";

/**
 * Add Category
 * @param req
 * @param res
 * @param next
 */
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      id_includes = "",
      search_key = "",
      sort_by = "sort_order",
      sort_order = 1,
      parent_category = null,
      slug: querySlug = null, // alias to avoid name collision
      type = null,
      status = null,
      all = "false",
    } = req.query;
    const { slug: paramSlug = null } = req.params;

    const slug = paramSlug;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    const { pipeline, matchFilter } = await buildCategoryListPipeline(req.query, slug);
    let data;
    if (all === "true") {
      let allData = await Category.find(matchFilter)
        .select("_id name slug")
        .exec();
      return res.status(201).json({
        status: "success",
        message: req.__("List fetched successfully"),
        data: allData,
      });
    }
    if (slug) {
      // Fetch a single product by slug
      data = await Category.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Category not found"));
      }

      data = new CategoryResource(data[0]).exec();
    } else {
      data = await Category.aggregatePaginate(
        Category.aggregate(pipeline),
        options
      );

      data.docs = await CategoryResource.collection(data.docs);
    }
    res.status(201).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
