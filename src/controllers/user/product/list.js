import Product from "../../../models/Product.js";
import Category from "../../../models/Category.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import ProductResource from "../../../resources/ProductResource.js";
import mongoose from "mongoose";

/**
 * Add Product
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
      category = null,
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
    if (category) {
      const CategoryDetails = await Category.findOne({
        slug: category,
        deleted_at: null,
      }).exec();
      if (CategoryDetails?._id) {
        matchFilter.category = new mongoose.Types.ObjectId(
          CategoryDetails?._id
        );
      }
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
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "images", // 🔹 Reference to Media IDs
          foreignField: "_id",
          as: "media",
        },
      },
      {
        $lookup: {
          from: "seos",
          localField: "seo",
          foreignField: "_id",
          as: "seo",
        },
      },
      {
        $unwind: {
          path: "$seo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "wishlists",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product", "$$productId"] },
                    {
                      $eq: [
                        "$user",
                        req.auth?.user_id
                          ? new mongoose.Types.ObjectId(req.auth?.user_id)
                          : null,
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "wishlist",
        },
      },
      { $unwind: { path: "$wishlist", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "carts",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product", "$$productId"] },
                    {
                      $eq: [
                        "$user",
                        req.auth?.user_id
                          ? new mongoose.Types.ObjectId(req.auth?.user_id)
                          : null,
                      ],
                    },
                    { $eq: ["$deleted_at", null] },
                  ],
                },
              },
            },
          ],
          as: "cart",
        },
      },
      { $unwind: { path: "$cart", preserveNullAndEmptyArrays: true } },
    ];
    let data;
    if (slug) {
      // Fetch a single product by slug
      data = await Product.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Product not found"));
      }

      data = new ProductResource(data[0]).exec();
    } else {
      data = await Product.aggregatePaginate(
        Product.aggregate(pipeline),
        options
      );
      data.docs = await ProductResource.collection(data.docs);
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
