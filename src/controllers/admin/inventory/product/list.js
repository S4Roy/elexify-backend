import mongoose from "mongoose";
import Category from "../../../../models/Category.js";
import Tag from "../../../../models/Tag.js";
import Classification from "../../../../models/Classification.js";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Product from "../../../../models/Product.js";
import SiteSetting from "../../../../models/SiteSetting.js";
import { StatusError, envs } from "../../../../config/index.js";
import ProductResource from "../../../../resources/ProductResource.js";

export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      _id = null,
      category = null,
      stock_status = null, // in_stock, low_stock, out_of_stock
      tags = null,
      classifications = null,
      all = "false",
    } = req.query;
    const { slug } = req.params;

    const options = {
      page,
      limit,
      sort: { [sort_by]: sort_order },
    };

    const matchFilter = { deleted_at: null };
    if (slug) matchFilter.slug = slug;
    if (_id) matchFilter._id = new mongoose.Types.ObjectId(_id);
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
      const existingCategory = await Category.findOne({
        slug: category,
        deleted_at: null,
      }).exec();
      if (existingCategory) {
        matchFilter.$or = [
          { categories: existingCategory._id },
          { sub_categories: existingCategory._id },
        ];
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
      ...(stock_status
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

    let data;
    if (all === "true") {
      let allData = await Product.find(matchFilter)
        .select("_id name slug")
        .exec();
      return res.status(201).json({
        status: "success",
        message: req.__("List fetched successfully"),
        data: allData,
      });
    }
    if (slug || _id) {
      const [productDoc] = await Product.aggregate(pipeline);
      if (!productDoc) {
        throw StatusError.notFound(req.__("Product not found"));
      }

      let productResource = new ProductResource(productDoc).exec();
      const specifications_pipeline = [
        {
          $match: {
            product_id: mongoose.Types.ObjectId(String(productDoc._id)),
            deleted_at: null,
            value: { $ne: null },
            status: "active",
            value: { $ne: "" },
          },
        },
        {
          $lookup: {
            from: "specifications",
            localField: "specification_id",
            foreignField: "_id",
            as: "specification",
          },
        },
        {
          $unwind: {
            path: "$specification",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            "specification.visible": true,
            "specification.status": "active",
          },
        },
        {
          $project: {
            _id: 1,
            product_id: 1,
            variation_id: 1,
            key: 1,
            label: 1,
            value: 1,
            unit: 1,
            value_string: 1,
            value_number: 1,
            status: 1,
            created_at: 1,
            updated_at: 1,
            "specification._id": 1,
            "specification.key": 1,
            "specification.label": 1,
            "specification.type": 1,
            "specification.unit": 1,
            "specification.options": 1,
            "specification.visible": 1,
            "specification.required": 1,
            "specification.sort_order": 1,
          },
        },
        // you can still sort if you want; change/remove as needed
        { $sort: { "specification.sort_order": 1, created_at: -1 } },
      ];

      const specifications = await ProductSpecification.aggregate(
        specifications_pipeline
      );
      productResource.specifications = specifications;
      data = productResource;
    } else {
      data = await Product.aggregatePaginate(
        Product.aggregate(pipeline),
        options
      );
      data.docs = await ProductResource.collection(data.docs);
    }

    res.status(200).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data,
    });
  } catch (error) {
    next(error);
  }
};
