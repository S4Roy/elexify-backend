import Category from "../../../../models/Category.js";
import { StatusError, envs } from "../../../../config/index.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
import mongoose from "mongoose";
import { inventoryService } from "../../../../services/index.js";

/**
 * List Categories with Products, Child Counts & Breadcrumbs
 */
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "sort_order",
      sort_order = 1,
      parent_category = null, // query param (not used currently)
      type = null, // query param
      parent_category_slug = null, // query param
    } = req.query;

    const { slug = null } = req.params;

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { [sort_by]: sort_order },
    };

    let matchFilter = { deleted_at: null, status: "active" };
    let CategoryDetails = null;

    // Resolve parent_category_slug -> parent category id filter
    if (parent_category_slug) {
      CategoryDetails = await Category.findOne({
        slug: parent_category_slug,
        deleted_at: null,
      }).lean();

      if (!CategoryDetails) {
        throw StatusError.notFound(req.__("Category not found"));
      }

      matchFilter.parent_category = new mongoose.Types.ObjectId(
        CategoryDetails._id
      );
    }

    // Search filter
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: search_key, $options: "i" } },
        { slug: { $regex: search_key, $options: "i" } },
      ];
    }

    // Parent-only filter
    if (type === "parent") {
      matchFilter.parent_category = null;
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchFilter },

      // populate parent_category (single)
      {
        $lookup: {
          from: "categories",
          localField: "parent_category",
          foreignField: "_id",
          as: "parent_category",
        },
      },
      {
        $unwind: { path: "$parent_category", preserveNullAndEmptyArrays: true },
      },

      // top-level image
      {
        $lookup: {
          from: "medias",
          localField: "image",
          foreignField: "_id",
          as: "image",
        },
      },
      { $unwind: { path: "$image", preserveNullAndEmptyArrays: true } },

      // -----------------------------------------------------------
      // Product count (counts products referencing this category
      // in either `categories` or `sub_categories`)
      // -----------------------------------------------------------
      {
        $lookup: {
          from: "products",
          let: { categoryId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $in: ["$$categoryId", "$categories"] },
                    { $in: ["$$categoryId", "$sub_categories"] },
                  ],
                },
                deleted_at: null,
                // only count simple products (keeps your previous intent)
                type: { $in: ["simple"] },
              },
            },
            { $count: "count" },
          ],
          as: "products_count",
        },
      },

      // -----------------------------------------------------------
      // Variations count (count active, visible variations whose parent product
      // references this category in categories OR sub_categories)
      // -----------------------------------------------------------
      {
        $lookup: {
          from: "product_variations",
          let: { categoryId: "$_id" },
          pipeline: [
            // filter variations first for performance (fields are on variation doc)
            {
              $match: {
                deleted_at: null,
                status: "active",
                visible_in_list: true,
              },
            },
            // join parent product
            {
              $lookup: {
                from: "products",
                localField: "product_id",
                foreignField: "_id",
                as: "product",
              },
            },
            {
              $unwind: { path: "$product", preserveNullAndEmptyArrays: false },
            },
            // now ensure parent product and variation belong to this category
            {
              $match: {
                $expr: {
                  $or: [
                    { $in: ["$$categoryId", "$product.categories"] },
                    { $in: ["$$categoryId", "$product.sub_categories"] },
                  ],
                },
                // ensure parent product is not deleted and variation is active
                "product.deleted_at": null,
                "product.status": "active",
              },
            },
            { $count: "count" },
          ],
          as: "variations_count",
        },
      },

      // Merge product and variation counts -> numeric `products`
      {
        $addFields: {
          products: {
            $add: [
              {
                $ifNull: [{ $arrayElemAt: ["$products_count.count", 0] }, 0],
              },
              {
                $ifNull: [{ $arrayElemAt: ["$variations_count.count", 0] }, 0],
              },
            ],
          },
        },
      },

      // -----------------------------------------------------------
      // Child categories (count only)
      // -----------------------------------------------------------
      {
        $lookup: {
          from: "categories",
          let: { parentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$parent_category", "$$parentId"] },
                deleted_at: null,
              },
            },
            { $count: "count" },
          ],
          as: "child_categories_count",
        },
      },
      {
        $addFields: {
          has_children: { $gt: [{ $size: "$child_categories_count" }, 0] },
          child_count: {
            $ifNull: [
              { $arrayElemAt: ["$child_categories_count.count", 0] },
              0,
            ],
          },
        },
      },

      // cleanup temporary arrays
      {
        $project: {
          products_count: 0,
          variations_count: 0,
          child_categories_count: 0,
        },
      },
    ];

    // ---------------------------------------------------------------------
    // Natural / numeric-aware sorting for `name`
    // ---------------------------------------------------------------------
    if (sort_by === "name") {
      pipeline.push({
        $addFields: {
          __num_match_obj: {
            $regexFind: { input: "$name", regex: /(\d+)/ },
          },
        },
      });

      pipeline.push({
        $addFields: {
          __sort_numeric_prefix: {
            $cond: [
              { $ne: ["$__num_match_obj", null] },
              { $toInt: "$__num_match_obj.match" },
              999999,
            ],
          },
        },
      });

      pipeline.push({
        $sort: {
          __sort_numeric_prefix: Number(sort_order),
          name: Number(sort_order),
        },
      });

      // let aggregatePaginate manage sorting (avoid conflicting sorts)
      delete options.sort;
    }

    // 4️⃣ Execute query
    let data;
    if (slug) {
      // For details: add banners and details blocks then run aggregation
      let slug_details = await Category.findOne({
        slug: slug,
        deleted_at: null,
      }).lean();

      if (!slug_details) {
        throw StatusError.notFound(req.__("Category not found"));
      }
      pipeline.push({
        $match: {
          _id: new mongoose.Types.ObjectId(slug_details._id),
        },
      });

      pipeline.push(
        {
          $lookup: {
            from: "medias",
            localField: "banner",
            foreignField: "_id",
            as: "banner",
          },
        },
        { $unwind: { path: "$banner", preserveNullAndEmptyArrays: true } },

        // details.block_2.image
        {
          $lookup: {
            from: "medias",
            localField: "details.block_2.image",
            foreignField: "_id",
            as: "details_block_2_image",
          },
        },
        {
          $unwind: {
            path: "$details_block_2_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_2.image": "$details_block_2_image" } },

        // details.block_4.image
        {
          $lookup: {
            from: "medias",
            localField: "details.block_4.image",
            foreignField: "_id",
            as: "details_block_4_image",
          },
        },
        {
          $unwind: {
            path: "$details_block_4_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_4.image": "$details_block_4_image" } },

        // details.block_4.bg
        {
          $lookup: {
            from: "medias",
            localField: "details.block_4.bg",
            foreignField: "_id",
            as: "details_block_4_bg",
          },
        },
        {
          $unwind: {
            path: "$details_block_4_bg",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_4.bg": "$details_block_4_bg" } },

        // details.block_5.image
        {
          $lookup: {
            from: "medias",
            localField: "details.block_5.image",
            foreignField: "_id",
            as: "details_block_5_image",
          },
        },
        {
          $unwind: {
            path: "$details_block_5_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_5.image": "$details_block_5_image" } },

        // details.block_6.image
        {
          $lookup: {
            from: "medias",
            localField: "details.block_6.image",
            foreignField: "_id",
            as: "details_block_6_image",
          },
        },
        {
          $unwind: {
            path: "$details_block_6_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_6.image": "$details_block_6_image" } },

        // details.block_7.image
        {
          $lookup: {
            from: "medias",
            localField: "details.block_7.image",
            foreignField: "_id",
            as: "details_block_7_image",
          },
        },
        {
          $unwind: {
            path: "$details_block_7_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_7.image": "$details_block_7_image" } },

        // details.block_8.image
        {
          $lookup: {
            from: "medias",
            localField: "details.block_8.image",
            foreignField: "_id",
            as: "details_block_8_image",
          },
        },
        {
          $unwind: {
            path: "$details_block_8_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_8.image": "$details_block_8_image" } },

        // details.block_8.bg
        {
          $lookup: {
            from: "medias",
            localField: "details.block_8.bg",
            foreignField: "_id",
            as: "details_block_8_bg",
          },
        },
        {
          $unwind: {
            path: "$details_block_8_bg",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $addFields: { "details.block_8.bg": "$details_block_8_bg" } },

        // cleanup temporary detail lookup fields
        {
          $project: {
            details_block_2_image: 0,
            details_block_4_image: 0,
            details_block_4_bg: 0,
            details_block_5_image: 0,
            details_block_6_image: 0,
            details_block_7_image: 0,
            details_block_8_image: 0,
            details_block_8_bg: 0,
          },
        }
      );

      const aggData = await Category.aggregate(pipeline);
      if (!aggData.length) {
        throw StatusError.notFound(req.__("Category not found"));
      }

      data = new CategoryResource(aggData[0]).exec();

      // add breadcrumbs for details view
      data.breadcrumbs = await inventoryService.breadcrumbService.category(
        slug
      );
    } else {
      // list view
      data = await Category.aggregatePaginate(Category.aggregate(pipeline), {
        ...options,
        collation: { locale: "en", numericOrdering: true },
      });

      data.docs = await CategoryResource.collection(data.docs);

      // attach breadcrumbs if parent_category_slug is given
      if (CategoryDetails) {
        data.breadcrumbs = await inventoryService.breadcrumbService.category(
          parent_category_slug
        );
        data.breadcrumbs_data =
          await inventoryService.breadcrumbService.category_tree(
            parent_category_slug
          );
        data.slug = parent_category_slug;
      }
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
