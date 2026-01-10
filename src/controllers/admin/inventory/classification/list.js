import Classification from "../../../../models/Classification.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import ClassificationResource from "../../../../resources/ClassificationResource.js";
import mongoose from "mongoose";

/**
 * Add Classification
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
      parent_classification = null,
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
      let existingItem = await Classification.findOne({
        slug: querySlug,
      }).exec();
      matchFilter.parent_classification = existingItem?._id;
    }
    if (
      parent_classification &&
      mongoose.Types.ObjectId.isValid(parent_classification)
    ) {
      matchFilter.parent_classification = new mongoose.Types.ObjectId(
        parent_classification
      );
    } else {
      // matchFilter.parent_classification = null;
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
          from: "classifications",
          localField: "parent_classification",
          foreignField: "_id",
          as: "parent_classification",
        },
      },
      {
        $unwind: {
          path: "$parent_classification",
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

      // Count child classifications
      {
        $lookup: {
          from: "products",
          let: { classificationId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$deleted_at", null] },
                    {
                      $in: [
                        "$$classificationId",
                        { $ifNull: ["$classifications", []] },
                      ],
                    },
                  ],
                },
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
      data = await Classification.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Classification not found"));
      }

      data = new ClassificationResource(data[0]).exec();
    } else {
      data = await Classification.aggregatePaginate(
        Classification.aggregate(pipeline),
        options
      );

      data.docs = await ClassificationResource.collection(data.docs);
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
