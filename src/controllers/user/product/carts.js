import Cart from "../../../models/Cart.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import CartResource from "../../../resources/CartResource.js";
import mongoose from "mongoose";

/**
 * Edit Product
 * @param req
 * @param res
 * @param next
 */
export const carts = async (req, res, next) => {
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
          "product.cart._id": "$_id",
          "product.cart.quantity": "$quantity",
        },
      },
      // 🔍 Cart info
      {
        $lookup: {
          from: "wishlists",
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
          as: "product.wishlist",
        },
      },
      {
        $unwind: {
          path: "$product.wishlist",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          price: { $ifNull: ["$product.selling_price", 0] },
          total_price: {
            $multiply: [
              { $ifNull: ["$product.selling_price", 0] },
              { $ifNull: ["$quantity", 0] },
            ],
          },
        },
      },
    ];
    // Clone base pipeline to compute grand total separately
    const totalPipeline = [
      ...pipeline,
      {
        $group: {
          _id: null,
          grand_total_price: { $sum: "$total_price" },
        },
      },
    ];

    const grandTotalResult = await Cart.aggregate(totalPipeline);

    const data = await Cart.aggregatePaginate(
      Cart.aggregate(pipeline),
      options
    );
    data.docs = await CartResource.collection(data.docs);
    data.grand_total_price = grandTotalResult[0]?.grand_total_price ?? 0;

    res.status(201).json({
      status: "success",
      message: req.__(`List fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
