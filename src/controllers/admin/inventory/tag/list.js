import Tag from "../../../../models/Tag.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import TagResource from "../../../../resources/TagResource.js";
import mongoose from "mongoose";

/**
 * Add Tag
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
      parent_tag = null,
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
      let existingItem = await Tag.findOne({ slug: querySlug }).exec();
      matchFilter.parent_tag = existingItem?._id;
    }
    if (parent_tag && mongoose.Types.ObjectId.isValid(parent_tag)) {
      matchFilter.parent_tag = new mongoose.Types.ObjectId(parent_tag);
    } else {
      // matchFilter.parent_tag = null;
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
          from: "tags",
          localField: "parent_tag",
          foreignField: "_id",
          as: "parent_tag",
        },
      },
      {
        $unwind: {
          path: "$parent_tag",
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

      // Count child tags
      {
        $lookup: {
          from: "products",
          let: { tagId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$$tagId", "$tags"] }, // $$tagId is in the array field `tags`
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

    if (slug) {
      // Fetch a single product by slug
      data = await Tag.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Tag not found"));
      }

      data = new TagResource(data[0]).exec();
    } else {
      data = await Tag.aggregatePaginate(Tag.aggregate(pipeline), options);

      data.docs = await TagResource.collection(data.docs);
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
