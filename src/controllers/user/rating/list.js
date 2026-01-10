import Rating from "../../../models/Rating.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import RatingResource from "../../../resources/RatingResource.js";
import mongoose from "mongoose";

/**
 * Add Rating
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
    const { _id = null } = req.params;
    const user_id = req.auth?.user_id || null;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = {
      deleted_at: null,
    };

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },

      // 🔹 Join with users
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // 🔹 Join with products
      {
        $lookup: {
          from: "products",
          localField: "product_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

      // 🔹 Join with product variations (if exists)
      {
        $lookup: {
          from: "product_variations",
          localField: "variation_id",
          foreignField: "_id",
          as: "variation",
        },
      },
      { $unwind: { path: "$variation", preserveNullAndEmptyArrays: true } },

      // 🔹 Join with medias
      {
        $lookup: {
          from: "medias",
          localField: "media",
          foreignField: "_id",
          as: "media",
        },
      },

      // Optional: project only necessary fields
      {
        $project: {
          rating: 1,
          description: 1,
          status: 1,
          created_at: 1,

          "user._id": 1,
          "user.name": 1,
          "user.email": 1,

          "product._id": 1,
          "product.name": 1,

          "variation._id": 1,
          "variation.sku": 1,

          media: 1,
        },
      },
    ];
    let data;

    data = await Rating.aggregatePaginate(Rating.aggregate(pipeline), options);

    data.docs = await RatingResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
