import Banner from "../../../models/Banner.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import AdminBannerResource from "../../../resources/AdminBannerResource.js";
import mongoose from "mongoose";

/**
 * List Banner
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
      sort_by = "created_at",
      sort_order = -1,
      parent_category = null,
      slug: querySlug = null, // alias to avoid name collision
      type = null,
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
      let existingCategory = await Banner.findOne({ slug: querySlug }).exec();
      matchFilter.parent_category = existingCategory?._id;
    }
    if (parent_category && mongoose.Types.ObjectId.isValid(parent_category)) {
      matchFilter.parent_category = new mongoose.Types.ObjectId(
        parent_category
      );
    } else {
      // matchFilter.parent_category = null;
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

      // Count child categories
      {
        $lookup: {
          from: "products",
          let: { categoryId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$$categoryId", "$categories"] }, // $$categoryId is in the array field `categories`
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
    let data;

    if (slug) {
      // Fetch a single product by slug
      data = await Banner.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Banner not found"));
      }

      data = new AdminBannerResource(data[0]).exec();
    } else {
      data = await Banner.aggregatePaginate(
        Banner.aggregate(pipeline),
        options
      );

      data.docs = await AdminBannerResource.collection(data.docs);
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
