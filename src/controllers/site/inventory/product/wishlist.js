import Category from "../../../../models/Category.js";
import Product from "../../../../models/Product.js";
import Wishlist from "../../../../models/Wishlist.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import mongoose from "mongoose";

export const wishlist = async (req, res, next) => {
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
      page,
      limit,
      // sort: { [sort_by]: sort_order },
    };

    const matchFilter = { deleted_at: null };
    if (slug) matchFilter.slug = slug;

    if (category) {
      const slugs = category.split(",").map((s) => s.trim());
      const foundCategories = await Category.find({
        slug: { $in: slugs },
        deleted_at: null,
      }).select("_id");
      if (foundCategories.length) {
        const categoryIds = foundCategories.map((cat) => cat._id);
        matchFilter.categories = { $in: categoryIds };
      }
    }

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }

    const productPipeline = [
      {
        $match: {
          ...matchFilter,
          type: "simple",
        },
      },
      {
        $lookup: {
          from: "tags",
          localField: "tags",
          foreignField: "_id",
          as: "tags",
        },
      },
      {
        $lookup: {
          from: "classifications",
          localField: "classifications",
          foreignField: "_id",
          as: "classifications",
        },
      },
      {
        $addFields: {
          is_variation: false,
          variation_id: null,
        },
      },
    ];

    const variationPipeline = [
      {
        $match: {
          deleted_at: null,
          status: "active",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $match: {
          "product.deleted_at": null,
        },
      },
      // Attribute values
      {
        $lookup: {
          from: "attribute_values",
          localField: "attributes.value_id",
          foreignField: "_id",
          as: "attribute_values",
        },
      },
      // Lookup variation images using $lookup + $expr + $in
      {
        $lookup: {
          from: "medias",
          let: { imageIds: "$images" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$imageIds"] },
              },
            },
          ],
          as: "variation_images",
        },
      },
      {
        $project: {
          _id: 0,
          variation_id: "$_id",
          is_variation: true,
          product_id: "$product._id",
          slug: "$product.slug",
          brand: "$product.brand",
          categories: "$product.categories",
          description: "$product.description",
          short_description: "$product.short_description",
          seo: "$product.seo",
          regular_price: "$regular_price",
          sale_price: "$sale_price",
          stock_quantity: "$stock_quantity",
          sku: "$sku",
          weight: "$weight",
          dimensions: "$dimensions",
          shipping_class: "$shipping_class",
          status: "$product.status",
          created_at: "$product.created_at",
          updated_at: "$product.updated_at",
          ask_for_price: "$ask_for_price",

          // Final product name with attributes
          name: {
            $let: {
              vars: {
                base: "$product.name",
                attrs: "$attribute_values",
              },
              in: {
                $cond: {
                  if: { $gt: [{ $size: "$$attrs" }, 0] },
                  then: {
                    $concat: [
                      "$$base",
                      " (",
                      {
                        $reduce: {
                          input: "$$attrs",
                          initialValue: "",
                          in: {
                            $cond: [
                              { $eq: ["$$value", ""] },
                              "$$this.name",
                              {
                                $concat: ["$$value", ", ", "$$this.name"],
                              },
                            ],
                          },
                        },
                      },
                      ")",
                    ],
                  },
                  else: "$$base",
                },
              },
            },
          },

          images: {
            $cond: {
              if: { $gt: [{ $size: "$variation_images" }, 0] },
              then: {
                $map: {
                  input: "$variation_images",
                  as: "img",
                  in: "$$img._id",
                },
              },
              else: {
                $map: {
                  input: "$product.images",
                  as: "imgId",
                  in: "$$imgId", // keep ObjectId for now; format in outer pipeline
                },
              },
            },
          },
        },
      },
    ];

    const pipeline = [
      {
        $unionWith: {
          coll: "product_variations",
          pipeline: variationPipeline,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "images",
          foreignField: "_id",
          as: "images",
        },
      },
      {
        $addFields: {
          images: {
            $map: {
              input: "$images",
              as: "img",
              in: {
                _id: "$$img._id",
                url: { $concat: [envs.s3.BASE_URL, "$$img.url"] },
                alt: "$$img.alt",
              },
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
          let: {
            productId: "$_id",
            variationId: "$variation_id",
            userId: user_id ? new mongoose.Types.ObjectId(user_id) : null,
            guestId: guest_id || null,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $or: [
                        {
                          $and: [
                            { $eq: ["$product", "$$productId"] },
                            { $eq: ["$variation", null] },
                          ],
                        },
                        {
                          $and: [
                            { $eq: ["$variation", "$$variationId"] },
                            { $ne: ["$variation", null] },
                          ],
                        },
                      ],
                    },
                    { $eq: ["$deleted_at", null] },
                    {
                      $or: [
                        ...(user_id ? [{ $eq: ["$user", "$$userId"] }] : []),
                        ...(guest_id
                          ? [{ $eq: ["$guest_id", "$$guestId"] }]
                          : []),
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
      {
        $unwind: {
          path: "$wishlist",
          preserveNullAndEmptyArrays: false,
        },
      },

      {
        $lookup: {
          from: "carts",
          let: {
            productId: "$_id",
            variationId: "$variation_id",
            userId: user_id ? new mongoose.Types.ObjectId(user_id) : null,
            guestId: guest_id || null,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $or: [
                        {
                          $and: [
                            { $eq: ["$product", "$$productId"] },
                            { $eq: ["$variation", null] },
                          ],
                        },
                        {
                          $and: [
                            { $eq: ["$variation", "$$variationId"] },
                            { $ne: ["$variation", null] },
                          ],
                        },
                      ],
                    },
                    { $eq: ["$deleted_at", null] },
                    {
                      $or: [
                        ...(user_id ? [{ $eq: ["$user", "$$userId"] }] : []),
                        ...(guest_id
                          ? [{ $eq: ["$guest_id", "$$guestId"] }]
                          : []),
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "cart",
        },
      },
      {
        $addFields: {
          debug_cart_count: { $size: "$cart" },
          cart: {
            $cond: {
              if: { $gt: [{ $size: "$cart" }, 0] },
              then: { $arrayElemAt: ["$cart", 0] },
              else: false,
            },
          },
        },
      },
      {
        $addFields: {
          price: {
            $cond: {
              if: { $gt: ["$sale_price", 0] },
              then: "$sale_price",
              else: "$regular_price",
            },
          },
        },
      },
      {
        $sort: { [sort_by]: sort_order },
      },
    ];

    const result = await Product.aggregatePaginate(
      Product.aggregate([...productPipeline, ...pipeline]),
      options
    );

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
