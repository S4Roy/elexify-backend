import mongoose from "mongoose";
import Category from "../../../models/Category.js";
import Tag from "../../../models/Tag.js";
import Brand from "../../../models/Brand.js";
import Classification from "../../../models/Classification.js";
import SiteSetting from "../../../models/SiteSetting.js";
import { envs } from "../../../config/index.js";

export const buildProductListPipeline = async (query = {}, slug = null) => {
    const {
      search_key = "",
      _id = null,
      category = null,
      brand = null,
      status = null,
      type = null,
      stock_status = null, // in_stock, low_stock, out_of_stock
      tags = null,
      classifications = null,
      min_price = null,
      max_price = null,
    } = query;
    const matchFilter = { deleted_at: null };
    if (slug) matchFilter.slug = slug;
    if (_id) matchFilter._id = new mongoose.Types.ObjectId(_id);
    if (status) matchFilter.status = status;
    if (type) matchFilter.type = type;
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
        tagIds = foundTags.map((tag) => tag._id);
        matchFilter.tags = { $in: tagIds };
      }
    }
    if (category) {
      const category_slugs = category.split(",").map((s) => s.trim());
      const foundCategories = await Category.find({
        slug: { $in: category_slugs },
        deleted_at: null,
      }).select("_id");
      if (foundCategories.length) {
        const categoryIds = foundCategories.map((cat) => cat._id);
        matchFilter.$or = [
          { categories: { $in: categoryIds } },
          { sub_categories: { $in: categoryIds } },
        ];
      }
    }

    // 🔹 Filter by brand
    if (brand) {
      const brand_slugs = brand.split(",").map((s) => s.trim());
      const foundBrands = await Brand.find({
        slug: { $in: brand_slugs },
        deleted_at: null,
      }).select("_id");
      if (foundBrands.length) {
        matchFilter.brand = { $in: foundBrands.map((b) => b._id) };
      }
    }

    // Get low stock threshold dynamically from DB if available
    let lowStockThreshold = 5;
    const lowStockSetting = await SiteSetting.findOne({
      slug: "low_stock_threshold",
    });
    if (lowStockSetting?.value && !isNaN(lowStockSetting.value)) {
      lowStockThreshold = Number(lowStockSetting.value);
    }

    const pipeline = [
      { $match: matchFilter },
      // BEFORE variation lookups
      ...(stock_status
        ? [
            {
              $match: {
                $or: [
                  // simple products: filter here using product.stock_quantity
                  ...(stock_status === "in_stock"
                    ? [
                        {
                          type: "simple",
                          stock_quantity: { $gt: lowStockThreshold },
                        },
                      ]
                    : []),
                  ...(stock_status === "low_stock"
                    ? [
                        {
                          type: "simple",
                          stock_quantity: { $gt: 0, $lt: lowStockThreshold },
                        },
                      ]
                    : []),
                  ...(stock_status === "out_of_stock"
                    ? [{ type: "simple", stock_quantity: 0 }]
                    : []),

                  // variable products: pass through now; they will be narrowed after $lookup of variations
                  { type: "variable" },
                ],
              },
            },
          ]
        : []),
      // BEFORE variation lookups — price range
      ...(min_price || max_price
        ? [
            {
              $match: {
                $or: [
                  // simple products: filter here using product.regular_price
                  {
                    type: "simple",
                    regular_price: {
                      ...(min_price ? { $gte: Number(min_price) } : {}),
                      ...(max_price ? { $lte: Number(max_price) } : {}),
                    },
                  },
                  // variable products: pass through now; narrowed after $lookup of variations
                  { type: "variable" },
                ],
              },
            },
          ]
        : []),
      // Lookups
      {
        $lookup: {
          from: "brands",
          localField: "brand",
          foreignField: "_id",
          as: "brand",
        },
      },
      { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "shipping_classes",
          localField: "shipping_class",
          foreignField: "_id",
          as: "shipping_class",
        },
      },
      { $unwind: { path: "$shipping_class", preserveNullAndEmptyArrays: true } },
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
        $lookup: {
          from: "seos",
          localField: "seo",
          foreignField: "_id",
          as: "seo",
        },
      },
      { $unwind: { path: "$seo", preserveNullAndEmptyArrays: true } },

      // Users
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "created_by",
        },
      },
      { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "updated_by",
          foreignField: "_id",
          as: "updated_by",
        },
      },
      { $unwind: { path: "$updated_by", preserveNullAndEmptyArrays: true } },

      // Attributes and variations
      {
        $lookup: {
          from: "product_attributes",
          localField: "_id",
          foreignField: "product_id",
          as: "attributes",
        },
      },
      {
        $lookup: {
          from: "product_variations",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$product_id", "$$pid"] } } },
            { $match: { deleted_at: null } }, // ✅ only active variations
          ],
          as: "variations",
        },
      },

      // Variation stock_status filter (applies when product is variable)
      ...(stock_status
        ? [
            {
              $addFields: {
                variations: {
                  $filter: {
                    input: "$variations",
                    as: "v",
                    cond:
                      stock_status === "in_stock"
                        ? { $gt: ["$$v.stock_quantity", lowStockThreshold] }
                        : stock_status === "low_stock"
                        ? {
                            $and: [
                              { $gt: ["$$v.stock_quantity", 0] },
                              {
                                $lt: ["$$v.stock_quantity", lowStockThreshold],
                              },
                            ],
                          }
                        : { $eq: ["$$v.stock_quantity", 0] }, // out_of_stock or fallback
                  },
                },
              },
            },
          ]
        : []),

      // Variation price range filter (applies when product is variable)
      ...(min_price || max_price
        ? [
            {
              $addFields: {
                variations: {
                  $filter: {
                    input: "$variations",
                    as: "v",
                    cond: {
                      $and: [
                        ...(min_price
                          ? [{ $gte: ["$$v.regular_price", Number(min_price)] }]
                          : []),
                        ...(max_price
                          ? [{ $lte: ["$$v.regular_price", Number(max_price)] }]
                          : []),
                      ],
                    },
                  },
                },
              },
            },
          ]
        : []),

      // Lookup variation attribute values
      {
        $lookup: {
          from: "attribute_values",
          localField: "variations.attributes.value_id",
          foreignField: "_id",
          as: "variation_attr_values",
        },
      },
      // Lookup variation attribute definitions
      {
        $lookup: {
          from: "attributes",
          localField: "variation_attr_values.attribute_id",
          foreignField: "_id",
          as: "variation_attr_defs",
        },
      },
      // Variation media
      {
        $lookup: {
          from: "medias",
          localField: "variations.images",
          foreignField: "_id",
          as: "variation_media",
        },
      },
      {
        $addFields: {
          variations: {
            $map: {
              input: "$variations",
              as: "variation",
              in: {
                $mergeObjects: [
                  "$$variation",
                  {
                    images: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$variation_media",
                            as: "m",
                            cond: { $in: ["$$m._id", "$$variation.images"] },
                          },
                        },
                        as: "img",
                        in: {
                          _id: "$$img._id",
                          url: { $concat: [envs.s3.BASE_URL, "$$img.url"] },
                          alt: "$$img.alt",
                        },
                      },
                    },
                    attributes: {
                      $map: {
                        input: "$$variation.attributes",
                        as: "attr",
                        in: {
                          attribute: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$variation_attr_defs",
                                  as: "def",
                                  cond: {
                                    $eq: ["$$def._id", "$$attr.attribute_id"],
                                  },
                                },
                              },
                              0,
                            ],
                          },
                          value: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$variation_attr_values",
                                  as: "val",
                                  cond: {
                                    $eq: ["$$val._id", "$$attr.value_id"],
                                  },
                                },
                              },
                              0,
                            ],
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },

      // ===== NEW STAGE: exclude variable products that have no variations after filtering =====
      ...(stock_status || min_price || max_price
        ? [
            {
              $match: {
                $or: [
                  { type: "simple" },
                  // keep variable products only if they have at least one variation left
                  { $expr: { $gt: [{ $size: "$variations" }, 0] } },
                ],
              },
            },
          ]
        : []),
      // ======================================================================================
    ];
    // === search_key should also match variation.sku ===
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

    return { pipeline, matchFilter };
};
