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
    // 🔹 Filter by tags
    let tagIds = [];
    if (tags) {
      const tag_slugs = tags.split(",").map((s) => s.trim());
      const foundTags = await Tag.find({
        slug: { $in: tag_slugs },
        deleted_at: null,
      }).select("_id");
      if (foundTags.length) {
        tagIds = foundTags.map((tag) => new mongoose.Types.ObjectId(tag._id));
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
        categoryIds = foundCategories.map(
          (cat) => new mongoose.Types.ObjectId(cat._id)
        );
        matchFilter.$or = [
          { categories: { $in: categoryIds } },
          { sub_categories: { $in: categoryIds } },
        ];
        breadcrumbs = await inventoryService.breadcrumbService.category(
          slugs[0]
        );
      }
    }

    // SIMPLE products (not variations)
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

    // VARIATIONS (as separate list items)
    // This pipeline:
    // - excludes variations with visible_in_list: true
    // - resolves attribute docs and attribute_value docs (only visible_in_list/active)
    // - skips attribute values in name when their attribute.visible_in_list === true
    const variationPipeline = [
      // Exclude variations explicitly flagged visible_in_list
      {
        $match: {
          deleted_at: null,
          status: "active",
          visible_in_list: { $eq: true },
        },
      },

      // Join parent product
      {
        $lookup: {
          from: "products",
          localField: "product_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      { $match: { "product.deleted_at": null } },

      // Optional filters from parent product
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
              $match: { "product.classifications": { $in: classificationIds } },
            },
          ]
        : []),
      ...(tagIds.length
        ? [{ $match: { "product.tags": { $in: tagIds } } }]
        : []),

      // unwind attributes to lookup attribute doc & value doc
      { $unwind: { path: "$attributes", preserveNullAndEmptyArrays: true } },

      // lookup attribute doc (to check visible_in_list)
      {
        $lookup: {
          from: "attributes",
          localField: "attributes.attribute_id",
          foreignField: "_id",
          as: "attr_doc",
        },
      },
      { $unwind: { path: "$attr_doc", preserveNullAndEmptyArrays: true } },

      // lookup attribute value doc (only visible_in_list & active)
      {
        $lookup: {
          from: "attribute_values",
          let: { vid: "$attributes.value_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$vid"] },
                visible_in_list: true,
                status: "active",
                deleted_at: null,
              },
            },
            // project only necessary fields
            { $project: { _id: 1, name: 1, slug: 1, sort_order: 1 } },
          ],
          as: "val_doc",
        },
      },
      { $unwind: { path: "$val_doc", preserveNullAndEmptyArrays: true } },

      // lookup variation images
      {
        $lookup: {
          from: "medias",
          let: { imageIds: "$images" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", { $ifNull: ["$$imageIds", []] }] },
              },
            },
          ],
          as: "variation_images",
        },
      },

      // group back to variation level collecting:
      // - attrs_for_name (only values whose attribute.visible_in_list !== true)
      // - attribute_values_full (for UI) only when both attr_doc & val_doc exist
      {
        $group: {
          _id: "$_id",
          product_id: { $first: "$product_id" },
          product: { $first: "$product" },

          sku: { $first: "$sku" },
          images: { $first: "$images" },
          variation_images: { $first: "$variation_images" },

          regular_price: { $first: "$regular_price" },
          sale_price: { $first: "$sale_price" },
          stock_quantity: { $first: "$stock_quantity" },

          combination_key: { $first: "$combination_key" },
          ask_for_price: { $first: "$ask_for_price" },
          enable_enquiry: { $first: "$enable_enquiry" },
          avg_rating: { $first: "$avg_rating" },
          total_reviews: { $first: "$total_reviews" },
          rarity: { $first: "$rarity" },
          power_level: { $first: "$power_level" },
          weight: { $first: "$weight" },
          dimensions: { $first: "$dimensions" },
          shipping_class: { $first: "$shipping_class" },

          status: { $first: "$product.status" },
          created_at: { $first: "$product.created_at" },
          updated_at: { $first: "$product.updated_at" },

          attrs_for_name: {
            $push: {
              $cond: [
                // if either attr_doc or val_doc is missing => skip
                {
                  $or: [
                    { $eq: ["$attr_doc", null] },
                    { $eq: ["$val_doc", null] },
                  ],
                },
                "$$REMOVE",
                // else: include value only when attribute.visible_in_list !== true
                {
                  $cond: [
                    { $eq: ["$attr_doc.visible_in_list", false] },
                    "$$REMOVE",
                    "$val_doc.name",
                  ],
                },
              ],
            },
          },

          attribute_values_full: {
            $push: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$attr_doc", null] },
                    { $ne: ["$val_doc", null] },
                  ],
                },
                { attribute: "$attr_doc", value: "$val_doc" },
                "$$REMOVE",
              ],
            },
          },
          // keep variation-level ordering fields (if present on variation doc)
          sort_order: { $first: "$sort_order" },
          variation_created_at: { $first: "$created_at" },
        },
      },

      // build name suffix by joining attrs_for_name (if any)
      {
        $addFields: {
          attrs_for_name: { $ifNull: ["$attrs_for_name", []] },
          product_name: "$product.name",
          name_suffix: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$attrs_for_name", []] } }, 0] },
              {
                $reduce: {
                  input: "$attrs_for_name",
                  initialValue: "",
                  in: {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$this",
                      {
                        $cond: [
                          { $eq: ["$$this", ""] },
                          "$$value",
                          { $concat: ["$$this", " | ", "$$value"] },
                        ],
                      },
                    ],
                  },
                },
              },
              null,
            ],
          },
        },
      },
      // --- NEW: compute a numeric variation-level sort key based on attribute value sort_order ---
      // Use the minimum value.sort_order among attribute_values_full as the key.
      {
        $addFields: {
          variation_value_sort_order: {
            $cond: [
              {
                $gt: [
                  { $size: { $ifNull: ["$attribute_values_full", []] } },
                  0,
                ],
              },
              { $min: "$attribute_values_full.value.sort_order" },
              null,
            ],
          },
        },
      },
      // Sort variations by:
      // 1) variation_value_sort_order (asc) — variations with lower attribute-value order come first
      // 2) variation-level sort_order (asc)
      // 3) variation_created_at (desc) as tiebreaker
      {
        $sort: {
          variation_value_sort_order: 1,
          sort_order: 1,
          variation_created_at: -1,
        },
      },
      // final projection for variation rows
      {
        $project: {
          _id: 0,
          variation_id: "$_id",
          is_variation: true,

          sku: 1,
          product_id: 1,
          slug: "$product.slug",
          brand: "$product.brand",
          categories: "$product.categories",
          sub_categories: "$product.sub_categories",
          tags: "$product.tags",
          classifications: "$product.classifications",
          description: "$product.description",
          short_description: "$product.short_description",
          seo: "$product.seo",

          regular_price: 1,
          sale_price: 1,
          stock_quantity: 1,
          weight: 1,
          dimensions: 1,
          shipping_class: 1,
          status: 1,
          created_at: 1,
          updated_at: 1,

          // final name: product_name + ( | name_suffix ) if suffix exists
          name: {
            $trim: {
              input: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$product_name", null] },
                      { $ne: ["$name_suffix", null] },
                    ],
                  },
                  { $concat: ["$product_name", " | ", "$name_suffix"] },
                  {
                    $cond: [
                      { $ne: ["$product_name", null] },
                      "$product_name",
                      "$name_suffix",
                    ],
                  },
                ],
              },
            },
          },

          // prefer variation_images, fallback to product.images
          images: {
            $cond: {
              if: {
                $gt: [{ $size: { $ifNull: ["$variation_images", []] } }, 0],
              },
              then: {
                $map: {
                  input: "$variation_images",
                  as: "img",
                  in: "$$img._id",
                },
              },
              else: {
                $map: {
                  input: { $ifNull: ["$product.images", []] },
                  as: "imgId",
                  in: "$$imgId",
                },
              },
            },
          },

          attributes: "$attribute_values_full",
          combination_key: 1,
          regular_price: 1,
          sale_price: 1,
          avg_rating: 1,
          total_reviews: 1,
          ask_for_price: 1,
          enable_enquiry: 1,
          rarity: 1,
          power_level: 1,
        },
      },
    ];

    // MAIN pipeline (simple products UNION variations)
    const pipeline = [
      {
        $unionWith: {
          coll: "product_variations",
          pipeline: variationPipeline,
        },
      },

      // Categories / tags / classifications
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

      // Resolve media ids to URLs
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
              input: { $ifNull: ["$images", []] },
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

      // SEO
      {
        $lookup: {
          from: "seos",
          localField: "seo",
          foreignField: "_id",
          as: "seo",
        },
      },
      { $unwind: { path: "$seo", preserveNullAndEmptyArrays: true } },

      // Wishlist
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

      // Cart
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

      // Pricing & currency conversion
      {
        $addFields: {
          price: {
            $cond: [
              { $gt: ["$sale_price", 0] },
              "$sale_price",
              "$regular_price",
            ],
          },
        },
      },
      {
        $addFields: {
          converted_price: { $round: [{ $multiply: ["$price", rate] }, 2] },
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
                  2,
                ],
              },
              0,
            ],
          },
          currency: currency,
        },
      },

      // Price filter
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

      { $sort: { [sort_by]: sort_order } },
    ];

    // Add search at the very end (covers simple + variation rows)
    if (search_key) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search_key, $options: "i" } },
            { slug: { $regex: search_key, $options: "i" } },
            { sku: { $regex: search_key, $options: "i" } },
            { "attributes.value.value": { $regex: search_key, $options: "i" } }, // search attribute values
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
