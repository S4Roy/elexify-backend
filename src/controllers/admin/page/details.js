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
export const details = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
    } = req.query;
    const { slug = null } = req.params;
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };

    let matchFilter = { deleted_at: null };
    // Find the main category by slug
    const CategoryDetails = await Category.findOne({
      slug,
      deleted_at: null,
    }).exec();

    if (!CategoryDetails) {
      throw StatusError.notFound(req.__("Category not found"));
    }

    if (CategoryDetails?.parent_category) {
      // If the category has a parent, fetch its subcategories
      matchFilter.parent_category = new mongoose.Types.ObjectId(
        CategoryDetails._id
      );
    } else {
      // If it's a main category, fetch all its subcategories
      matchFilter.parent_category = CategoryDetails._id;
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

    const data = await Category.aggregatePaginate(
      Category.aggregate(pipeline),
      options
    );

    data.docs = await CategoryResource.collection(data.docs);
    res.status(201).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
