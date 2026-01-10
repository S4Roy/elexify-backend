import Attribute from "../../../../models/Attribute.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import AttributeResource from "../../../../resources/AttributeResource.js";
import mongoose from "mongoose";

/**
 *  Attribute
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
      slug: querySlug = null, // alias to avoid name collision
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
          from: "attribute_values",
          let: { attrId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$attribute_id", "$$attrId"] },
                    { $eq: ["$deleted_at", null] },
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
            { $unwind: { path: "$image", preserveNullAndEmptyArrays: true } },

            { $sort: { sort_order: 1, created_at: 1 } },
          ],
          as: "values",
        },
      },
    ];
    let data;

    if (slug) {
      // Fetch a single product by slug
      data = await Attribute.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Attribute not found"));
      }

      data = new AttributeResource(data[0]).exec();
    } else {
      data = await Attribute.aggregatePaginate(
        Attribute.aggregate(pipeline),
        options
      );

      data.docs = await AttributeResource.collection(data.docs);
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
