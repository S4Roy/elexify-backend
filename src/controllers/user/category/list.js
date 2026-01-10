import Category from "../../../models/Category.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import CategoryResource from "../../../resources/CategoryResource.js";
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
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      parent_category = null,
    } = req.query;
    const { slug = null } = req.params;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };
    if (slug) {
      matchFilter.slug = slug;
    }
    if (parent_category && mongoose.Types.ObjectId.isValid(parent_category)) {
      matchFilter.parent_category = new mongoose.Types.ObjectId(
        parent_category
      );
    } else {
      // matchFilter.parent_category = null;
    }
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "categories",
          localField: "parent_category",
          foreignField: "_id",
          as: "parent_category",
        },
      },
      {
        $unwind: {
          path: "$parent_category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "image",
          foreignField: "_id",
          as: "image",
        },
      },
      {
        $unwind: {
          path: "$image",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
    let data;

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
