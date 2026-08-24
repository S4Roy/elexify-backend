import Category from "../../../../models/Category.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
import mongoose from "mongoose";

/**
 * Add Category
 * @param req
 * @param res
 * @param next
 */
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      id_includes = "",
      search_key = "",
      sort_by = "sort_order",
      sort_order = 1,
      parent_category = null,
      slug: querySlug = null, // alias to avoid name collision
      type = null,
      status = null,
      all = "false",
    } = req.query;
    const { slug: paramSlug = null } = req.params;

    const slug = paramSlug;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };
    if (slug) {
      matchFilter.slug = slug;
    }
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }
    let idsArray = [];

    if (typeof id_includes === "string") {
      idsArray = id_includes
        .split(",")
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (idsArray.length) {
      matchFilter._id = { $in: idsArray };
    }
    if (querySlug) {
      let existingCategory = await Category.findOne({ slug: querySlug }).exec();
      matchFilter.parent_category = existingCategory?._id;
    }
    if (parent_category && mongoose.Types.ObjectId.isValid(parent_category)) {
      matchFilter.parent_category = new mongoose.Types.ObjectId(
        parent_category
      );
    } else {
      // matchFilter.parent_category = null;
    }

    // if (search_key) {
    //   matchFilter.$or = [
    //     { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
    //     { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
    //   ];
    // }

    const pipeline = [
      { $match: matchFilter },

      // parent_category populate
      {
        $lookup: {
          from: "categories",
          localField: "parent_category",
          foreignField: "_id",
          as: "parent_category",
        },
      },
      {
        $unwind: {
          path: "$parent_category",
          preserveNullAndEmptyArrays: true,
        },
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
      {
        $unwind: {
          path: "$image",
          preserveNullAndEmptyArrays: true,
        },
      },

      // top-level banner
      {
        $lookup: {
          from: "medias",
          localField: "banner",
          foreignField: "_id",
          as: "banner",
        },
      },
      {
        $unwind: {
          path: "$banner",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Count child categories
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
              },
            },
            { $count: "count" },
          ],
          as: "child_count_data",
        },
      },
      {
        $addFields: {
          products: {
            $cond: [
              { $gt: [{ $size: "$child_count_data" }, 0] },
              { $arrayElemAt: ["$child_count_data.count", 0] },
              0,
            ],
          },
        },
      },
      {
        $project: {
          child_count_data: 0,
        },
      },
    ];
    if (type == "parent") {
      // matchFilter.parent_category = null;
      pipeline.push({ $match: { parent_category: null } });
    }
    if (type == "sub") {
      // matchFilter.parent_category = { $ne: null };
      pipeline.push({ $match: { parent_category: { $ne: null } } });
    }
    if (search_key) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search_key, $options: "i" } },
            { slug: { $regex: search_key, $options: "i" } },
            // match if any variation has a sku that matches
            {
              "parent_category.name": { $regex: search_key, $options: "i" },
            },
          ],
        },
      });
    }
    let data;
    if (all === "true") {
      let allData = await Category.find(matchFilter)
        .select("_id name slug")
        .exec();
      return res.status(201).json({
        status: "success",
        message: req.__("List fetched successfully"),
        data: allData,
      });
    }
    if (slug) {
      // Fetch a single product by slug
      data = await Category.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Category not found"));
      }

      data = new CategoryResource(data[0]).exec();
    } else {
      data = await Category.aggregatePaginate(
        Category.aggregate(pipeline),
        options
      );

      data.docs = await CategoryResource.collection(data.docs);
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
