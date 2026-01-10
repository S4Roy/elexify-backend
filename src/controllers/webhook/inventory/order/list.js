import Product from "../../../../models/Product.js";
import Category from "../../../../models/Category.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import ProductResource from "../../../../resources/ProductResource.js";
import mongoose from "mongoose";

/**
 * Product List & Detail (with guest/auth wishlist & cart support)
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

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };

    let matchFilter = { deleted_at: null };
    if (slug) matchFilter.slug = slug;

    if (category) {
      const CategoryDetails = await Category.findOne({
        slug: category,
        deleted_at: null,
      }).exec();
      if (CategoryDetails?._id) {
        matchFilter.categories = { $in: [CategoryDetails._id] };
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
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $set: {
          categories: {
            $sortArray: {
              input: "$categories",
              sortBy: { _id: 1 }, // or -1 for descending
            },
          },
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "images",
          foreignField: "_id",
          as: "media",
        },
      },
      {
        $set: {
          media: {
            $sortArray: {
              input: "$media",
              sortBy: { _id: 1 }, // or -1 for descending
            },
          },
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
                      $or: [
                        user_id
                          ? {
                              $eq: [
                                "$user",
                                new mongoose.Types.ObjectId(user_id),
                              ],
                            }
                          : { $eq: [null, null] },
                        guest_id
                          ? { $eq: ["$guest_id", guest_id] }
                          : { $eq: [null, null] },
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
                      $or: [
                        user_id
                          ? {
                              $eq: [
                                "$user",
                                new mongoose.Types.ObjectId(user_id),
                              ],
                            }
                          : { $eq: [null, null] },
                        guest_id
                          ? { $eq: ["$guest_id", guest_id] }
                          : { $eq: [null, null] },
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
      // Get product details
      data = await Product.aggregate(pipeline);
      if (!data.length) {
        throw StatusError.notFound(req.__("Product not found"));
      }
      data = new ProductResource(data[0]).exec();
    } else {
      // Get paginated product list
      data = await Product.aggregatePaginate(
        Product.aggregate(pipeline),
        options
      );
      data.docs = await ProductResource.collection(data.docs);
    }

    res.status(201).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data,
    });
  } catch (error) {
    next(error);
  }
};
