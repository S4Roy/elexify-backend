import mongoose from "mongoose";
import Category from "../../../../models/Category.js";
import Product from "../../../../models/Product.js";
import Classification from "../../../../models/Classification.js";
import Tag from "../../../../models/Tag.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import { inventoryService } from "../../../../services/index.js";

export const list = async (req, res, next) => {
  try {
    const rates = await ExchangeRate.findOne().sort({ updated_at: -1 });

    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = 1,
      category = null,
      currency = "INR",
      price_min = null,
      price_max = null,
      classifications = null,
      tags = null,
    } = req.query;
    const { slug = null } = req.params;
    const rate = rates?.rates?.get(currency) ?? 1;
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;
    let breadcrumbs = [];
    let categoryIds = [];

    const options = {
      page,
      limit,
      // sort: { [sort_by]: sort_order },
    };

    const matchFilter = { deleted_at: null, status: "active" };
    if (slug) matchFilter.slug = slug;
    // 🔹 Filter by classifications
    let classificationIds = [];
    if (classifications) {
      const classifications_slugs = classifications
        .split(",")
        .map((s) => s.trim());
      const foundClassifications = await Classification.find({
        slug: { $in: classifications_slugs },
        deleted_at: null,
      }).select("_id");
      if (foundClassifications.length) {
        classificationIds = foundClassifications.map((cls) => cls._id);
        matchFilter.classifications = { $in: classificationIds };
      }
    }
    console.log(matchFilter);

    // 🔹 Filter by tags
    let tagIds = [];
    if (tags) {
      const tag_slugs = tags.split(",").map((s) => s.trim());
      const foundTags = await Tag.find({
        slug: { $in: tag_slugs },
        deleted_at: null,
      }).select("_id");
      if (foundTags.length) {
        tagIds = foundTags.map((tag) => tag._id);
        matchFilter.tags = { $in: tagIds };
      }
    }
    if (category) {
      const slugs = category.split(",").map((s) => s.trim());
      const foundCategories = await Category.find({
        slug: { $in: slugs },
        deleted_at: null,
      }).select("_id");
      if (foundCategories.length) {
        categoryIds = foundCategories.map((cat) => cat._id);
        matchFilter.$or = [
          { categories: { $in: categoryIds } },
          { sub_categories: { $in: categoryIds } },
        ];
        breadcrumbs = await inventoryService.breadcrumbService.category(
          slugs[0]
        );
      }
    }

    // if (search_key) {
    //   matchFilter.$or = [
    //     { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
    //     { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
    //   ];
    // }

    const productPipeline = [
      {
        $match: {
          ...matchFilter,
          type: "simple",
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
      ...(categoryIds.length
        ? [
            {
              $match: {
                $or: [
                  { "product.categories": { $in: categoryIds } },
                  { "product.sub_categories": { $in: categoryIds } },
                ],
              },
            },
          ]
        : []),
      ...(classificationIds.length
        ? [
            {
              $match: {
                "product.classifications": { $in: classificationIds },
              },
            },
          ]
        : []),

      ...(tagIds.length
        ? [
            {
              $match: {
                "product.tags": { $in: tagIds },
              },
            },
          ]
        : []),

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
          rarity: "$rarity",
          power_level: "$power_level",
          ask_for_price: "$ask_for_price",
          enable_enquiry: "$enable_enquiry",
          avg_rating: "$avg_rating",
          total_reviews: "$total_reviews",
          product_id: "$product._id",
          slug: "$product.slug",
          brand: "$product.brand",
          categories: "$product.categories",
          sub_categories: "$product.sub_categories",
          tags: "$product.tags",
          classifications: "$product.classifications",
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
                      " | ",
                      {
                        $reduce: {
                          input: "$$attrs",
                          initialValue: "",
                          in: {
                            $cond: [
                              { $eq: ["$$value", ""] },
                              "$$this.value",
                              {
                                $concat: ["$$value", " | ", "$$this.value"],
                              },
                            ],
                          },
                        },
                      },
                      "",
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
          from: "categories",
          localField: "sub_categories",
          foreignField: "_id",
          as: "sub_categories",
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
        $addFields: {
          debug_wishlist_count: { $size: "$wishlist" },
          wishlist: {
            $cond: {
              if: { $gt: [{ $size: "$wishlist" }, 0] },
              then: { $arrayElemAt: ["$wishlist", 0] },
              else: false,
            },
          },
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
        $addFields: {
          converted_price: {
            $round: [{ $multiply: ["$price", rate] }, 2],
          },
          converted_sale_price: {
            $round: [{ $multiply: ["$sale_price", rate] }, 2],
          },
          converted_regular_price: {
            $round: [{ $multiply: ["$regular_price", rate] }, 2],
          },
          discount_percent: {
            $cond: [
              {
                $and: [
                  { $gt: ["$regular_price", 0] },
                  { $gt: ["$sale_price", 0] },
                ],
              },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          { $subtract: ["$regular_price", "$sale_price"] },
                          "$regular_price",
                        ],
                      },
                      100,
                    ],
                  },
                  2, // round to 2 decimals
                ],
              },
              0,
            ],
          },
          currency: currency,
        },
      },
      // ✅ Price filter simplified
      ...(price_min || price_max
        ? [
            {
              $match: {
                converted_price: {
                  ...(price_min ? { $gte: Number(price_min) } : {}),
                  ...(price_max ? { $lte: Number(price_max) } : {}),
                },
              },
            },
          ]
        : []),

      {
        $sort: { [sort_by]: sort_order },
      },
    ];
    if (search_key) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search_key, $options: "i" } },
            { slug: { $regex: search_key, $options: "i" } },
            { sku: { $regex: search_key, $options: "i" } },
            // match if any variation has a sku that matches
            {
              variations: {
                $elemMatch: { sku: { $regex: search_key, $options: "i" } },
              },
            },
          ],
        },
      });
    }
    const result = await Product.aggregatePaginate(
      Product.aggregate([...productPipeline, ...pipeline]),
      options
    );

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: { ...result, breadcrumbs },
    });
  } catch (error) {
    next(error);
  }
};
