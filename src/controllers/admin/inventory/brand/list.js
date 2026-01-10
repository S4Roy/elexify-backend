import Brand from "../../../../models/Brand.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
import mongoose from "mongoose";

/**
 *  Brand
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
      parent_brand = null,
      slug: querySlug = null, // alias to avoid name collision
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
    if (querySlug) {
      let existingData = await Brand.findOne({ slug: querySlug }).exec();
      matchFilter.parent_brand = existingData?._id;
    }
    if (parent_brand && mongoose.Types.ObjectId.isValid(parent_brand)) {
      matchFilter.parent_brand = new mongoose.Types.ObjectId(parent_brand);
    } else {
      // matchFilter.parent_brand = null;
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
          from: "brands",
          localField: "parent_brand",
          foreignField: "_id",
          as: "parent_brand",
        },
      },
      {
        $unwind: {
          path: "$parent_brand",
          preserveNullAndEmptyArrays: true,
        },
      },
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

      // Count child brands
      {
        $lookup: {
          from: "products",
          let: { categoryId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$brand", "$$categoryId"] },
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
    let data;
    if (all === "true") {
      let allData = await Brand.find(matchFilter)
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
      data = await Brand.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Brand not found"));
      }

      data = new CategoryResource(data[0]).exec();
    } else {
      data = await Brand.aggregatePaginate(Brand.aggregate(pipeline), options);

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
