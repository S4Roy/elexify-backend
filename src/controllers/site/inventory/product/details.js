import Product from "../../../../models/Product.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import mongoose from "mongoose";

export const details = async (req, res, next) => {
  try {
    const rates = await ExchangeRate.findOne().sort({ updated_at: -1 });

    const { slug = null } = req.params;
    const { variation_id = null, currency = "INR" } = req.query;
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;
    const rate = rates?.rates?.get(currency) ?? 1;

    if (!slug) throw StatusError.badRequest("Slug is required");

    const pipeline = [
      { $match: { slug, deleted_at: null } },

      // categories (sorted)
      {
        $lookup: {
          from: "categories",
          let: { catIds: "$categories" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$_id", { $ifNull: ["$$catIds", []] }] },
                    { $eq: ["$deleted_at", null] },
                  ],
                },
              },
            },
            { $sort: { sort_order: 1, name: 1 } },
            { $project: { _id: 1, name: 1, slug: 1, sort_order: 1 } },
          ],
          as: "categories",
        },
      },

      // sub_categories (sorted)
      {
        $lookup: {
          from: "categories",
          let: { subCatIds: "$sub_categories" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$_id", { $ifNull: ["$$subCatIds", []] }] },
                    { $eq: ["$deleted_at", null] },
                  ],
                },
              },
            },
            { $sort: { sort_order: 1, name: 1 } },
            { $project: { _id: 1, name: 1, slug: 1, sort_order: 1 } },
          ],
          as: "sub_categories",
        },
      },

      // images / medias (sorted)
      {
        $lookup: {
          from: "medias",
          let: { imageIds: "$images" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", { $ifNull: ["$$imageIds", []] }],
                },
                // optionally skip deleted media if you track that
                // deleted_at: null
              },
            },
            { $sort: { sort_order: 1, created_at: -1 } },
            {
              $project: {
                _id: 1,
                url: 1,
                alt: 1,
                sort_order: 1,
                created_at: 1,
              },
            },
          ],
          as: "images",
        },
      },

      // tags (sorted)
      {
        $lookup: {
          from: "tags",
          let: { tagIds: "$tags" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$_id", { $ifNull: ["$$tagIds", []] }] },
                    { $eq: ["$deleted_at", null] },
                  ],
                },
              },
            },
            { $sort: { sort_order: 1, name: 1 } },
            { $project: { _id: 1, name: 1, slug: 1, sort_order: 1 } },
          ],
          as: "tags",
        },
      },

      // classifications (sorted)
      {
        $lookup: {
          from: "classifications",
          let: { clsIds: "$classifications" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ["$_id", { $ifNull: ["$$clsIds", []] }] },
                    { $eq: ["$deleted_at", null] },
                  ],
                },
              },
            },
            { $sort: { sort_order: 1, name: 1 } },
            { $project: { _id: 1, name: 1, slug: 1, sort_order: 1 } },
          ],
          as: "classifications",
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
      { $unwind: { path: "$seo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "product_attributes",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product_id", "$$productId"] },
                    // { $eq: ["$deleted_at", null] },
                    { $eq: ["$status", "active"] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "attributes",
                localField: "attribute_id",
                foreignField: "_id",
                as: "attribute_details",
              },
            },
            { $unwind: "$attribute_details" },
            {
              $lookup: {
                from: "attribute_values",
                let: { vals: "$values" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $in: ["$_id", { $ifNull: ["$$vals", []] }] },
                          { $eq: ["$deleted_at", null] },
                          { $eq: ["$status", "active"] },
                        ],
                      },
                    },
                  },
                  {
                    $lookup: {
                      from: "medias",
                      localField: "image", // attribute_value.image -> medias._id
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
                  {
                    $project: {
                      _id: 1,
                      description: 1,
                      name: 1,
                      slug: 1,
                      hex: 1,
                      image: {
                        $cond: [
                          { $ifNull: ["$image", false] },
                          {
                            _id: "$image._id",
                            url: { $concat: [envs.s3.BASE_URL, "$image.url"] },
                            alt: "$image.alt",
                          },
                          null,
                        ],
                      },
                      sort_order: 1,
                      // ⭐ NEW PRICE FIELDS ⭐
                      price_modifier: {
                        $round: [
                          {
                            $multiply: [
                              { $ifNull: ["$price_modifier", 0] },
                              rate,
                            ],
                          },
                          2,
                        ],
                      },
                      price_type: 1,
                    },
                  },

                  // { $sort: { created_at: -1 } }
                ],
                as: "attribute_values",
              },
            },
            // { $unwind: "$attr_values" },

            // {
            //   $group: {
            //     _id: "$attribute_id",
            //     name: { $first: "$attr_def.name" },
            //     values: {
            //       $push: {
            //         _id: "$attr_values._id",
            //         value: "$attr_values.value",
            //       },
            //     },
            //   },
            // },
          ],
          as: "attributes",
        },
      },
      {
        $lookup: {
          from: "product_variations",
          let: {
            productId: "$_id",
            productName: "$name",
            productImages: "$images",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product_id", "$$productId"] },
                    { $eq: ["$deleted_at", null] },
                    { $eq: ["$status", "active"] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "medias",
                localField: "images",
                foreignField: "_id",
                as: "media_docs",
              },
            },
            {
              $addFields: {
                images: {
                  $cond: {
                    if: { $gt: [{ $size: "$media_docs" }, 0] },
                    then: {
                      $map: {
                        input: "$media_docs",
                        as: "img",
                        in: {
                          _id: "$$img._id",
                          url: { $concat: [envs.s3.BASE_URL, "$$img.url"] },
                          alt: "$$img.alt",
                        },
                      },
                    },
                    else: "$$productImages", // fallback
                  },
                },
              },
            },
            {
              $unwind: {
                path: "$attributes",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "attribute_values",
                localField: "attributes.value_id",
                foreignField: "_id",
                as: "attr_value",
              },
            },
            {
              $unwind: {
                path: "$attr_value",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "attributes",
                localField: "attr_value.attribute_id",
                foreignField: "_id",
                as: "attr_def",
              },
            },
            {
              $unwind: { path: "$attr_def", preserveNullAndEmptyArrays: true },
            },

            {
              $group: {
                _id: "$_id",
                doc: {
                  $first: {
                    _id: "$_id",
                    product_id: "$product_id",
                    sku: "$sku",
                    avg_rating: "$avg_rating",
                    total_reviews: "$total_reviews",
                    regular_price: "$regular_price",
                    sale_price: "$sale_price",
                    stock_quantity: "$stock_quantity",
                    shipping_class: "$shipping_class",
                    ask_for_price: "$ask_for_price",
                    enable_enquiry: "$enable_enquiry",
                    power_level: "$power_level",
                    rarity: "$rarity",
                    weight: "$weight",
                    dimensions: "$dimensions",
                    combination_key: "$combination_key",
                    status: "$status",
                    images: "$images",
                  },
                },
                attributes: {
                  $push: {
                    attribute_id: "$attr_def._id",
                    name: "$attr_def.name",
                    value_id: "$attr_value._id",
                    value: "$attr_value.name",
                  },
                },
              },
            },

            {
              $addFields: {
                "doc.attributes": "$attributes",
                "doc.name": {
                  $concat: [
                    "$$productName",
                    " | ",
                    {
                      $reduce: {
                        input: "$attributes",
                        initialValue: "",
                        in: {
                          $cond: [
                            { $eq: ["$$value", ""] },
                            "$$this.value",
                            { $concat: ["$$value", " | ", "$$this.value"] },
                          ],
                        },
                      },
                    },
                    "",
                  ],
                },
                "doc.sale_price": {
                  $round: [{ $multiply: ["$doc.sale_price", rate] }, 2],
                },
                "doc.regular_price": {
                  $round: [{ $multiply: ["$doc.regular_price", rate] }, 2],
                },
                "doc.currency": currency,
              },
            },
            { $replaceRoot: { newRoot: "$doc" } },
          ],
          as: "variations",
        },
      },

      // Normalize IDs for both product and variation contexts
      {
        $addFields: {
          product_id_norm: { $ifNull: ["$product_id", "$_id"] },
          variation_id_norm: { $ifNull: ["$variation_id", null] },
        },
      },

      // ✅ WISHLIST Lookup (now includes variations in $let)
      {
        $lookup: {
          from: "wishlists",
          let: Object.assign(
            {
              productId: "$product_id_norm",
              variationId: "$variation_id_norm",
              variations: "$variations", // ✅ FIX: Pass variations array to scope
            },
            user_id ? { userId: new mongoose.Types.ObjectId(user_id) } : {},
            guest_id ? { guestId: guest_id } : {}
          ),
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    variation_id
                      ? {
                          $eq: [
                            "$variation",
                            new mongoose.Types.ObjectId(variation_id),
                          ],
                        }
                      : {
                          $or: [
                            {
                              $and: [
                                { $eq: ["$product", "$$productId"] },
                                { $eq: ["$variation", null] },
                              ],
                            },
                            {
                              $in: [
                                "$variation",
                                { $ifNull: ["$$variations._id", []] },
                              ],
                            },
                          ],
                        },
                    { $eq: ["$deleted_at", null] },
                    ...(user_id || guest_id
                      ? [
                          {
                            $or: [
                              ...(user_id
                                ? [{ $eq: ["$user", "$$userId"] }]
                                : []),
                              ...(guest_id
                                ? [{ $eq: ["$guest_id", "$$guestId"] }]
                                : []),
                            ],
                          },
                        ]
                      : []),
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
          debug_wishlist_count: { $size: { $ifNull: ["$wishlist", []] } },
          wishlist: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$wishlist", []] } }, 0] },
              { $arrayElemAt: ["$wishlist", 0] },
              false,
            ],
          },
        },
      },

      // ✅ CART Lookup (now includes variations in $let)
      {
        $lookup: {
          from: "carts",
          let: Object.assign(
            {
              productId: "$product_id_norm",
              variationId: "$variation_id_norm",
              variations: "$variations", // ✅ FIX: Pass variations array here too
            },
            user_id ? { userId: new mongoose.Types.ObjectId(user_id) } : {},
            guest_id ? { guestId: guest_id } : {}
          ),
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$deleted_at", null] },
                    variation_id
                      ? {
                          $eq: [
                            "$variation",
                            new mongoose.Types.ObjectId(variation_id),
                          ],
                        }
                      : {
                          $or: [
                            {
                              $and: [
                                { $eq: ["$product", "$$productId"] },
                                { $eq: ["$variation", null] },
                              ],
                            },
                            {
                              $in: [
                                "$variation",
                                { $ifNull: ["$$variations._id", []] },
                              ],
                            },
                          ],
                        },
                    ...(user_id || guest_id
                      ? [
                          {
                            $or: [
                              ...(user_id
                                ? [{ $eq: ["$user", "$$userId"] }]
                                : []),
                              ...(guest_id
                                ? [{ $eq: ["$guest_id", "$$guestId"] }]
                                : []),
                            ],
                          },
                        ]
                      : []),
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
          debug_cart_count: { $size: { $ifNull: ["$cart", []] } },
          cart: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$cart", []] } }, 0] },
              { $arrayElemAt: ["$cart", 0] },
              false,
            ],
          },
        },
      },

      {
        $addFields: {
          sale_price: {
            $round: [{ $multiply: ["$sale_price", rate] }, 2],
          },
          regular_price: {
            $round: [{ $multiply: ["$regular_price", rate] }, 2],
          },
          currency: currency,
        },
      },
    ];

    const data = await Product.aggregate(pipeline);
    if (!data.length) throw StatusError.notFound("Product not found");

    res.status(200).json({
      status: "success",
      message: "Details fetched successfully",
      data: data[0],
    });
  } catch (error) {
    next(error);
  }
};
