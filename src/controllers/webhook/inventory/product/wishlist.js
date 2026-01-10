import Wishlist from "../../../../models/Wishlist.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import WishListResource from "../../../../resources/WishListResource.js";
import mongoose from "mongoose";

/**
 * Edit Product
 * @param req
 * @param res
 * @param next
 */
export const wishlist = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
    } = req.query;
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = {
      deleted_at: null,
      // user: user_id,
    };
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
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      {
        $unwind: {
          path: "$product",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "product.category",
        },
      },
      {
        $unwind: {
          path: "$product.category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "seos",
          localField: "product.seo",
          foreignField: "_id",
          as: "product.seo",
        },
      },
      {
        $unwind: {
          path: "$product.seo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "product.images", // 🔹 Reference to Media IDs
          foreignField: "_id",
          as: "product.media",
        },
      },
      {
        $addFields: {
          "product.wishlist._id": "$_id",
        },
      },
      // 🔍 Cart info
      {
        $lookup: {
          from: "carts",
          let: { productId: "$product._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product", "$$productId"] },
                    { $eq: ["$user", new mongoose.Types.ObjectId(user_id)] },
                    { $eq: ["$deleted_at", null] },
                  ],
                },
              },
            },
          ],
          as: "product.cart",
        },
      },
      {
        $unwind: {
          path: "$product.cart",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    const data = await Wishlist.aggregatePaginate(
      Wishlist.aggregate(pipeline),
      options
    );
    data.docs = await WishListResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`List fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
