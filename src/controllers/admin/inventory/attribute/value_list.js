import AttributeValue from "../../../../models/AttributeValue.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import AttributeValueResource from "../../../../resources/AttributeValueResource.js";
import mongoose from "mongoose";

/**
 *  AttributeValue
 * @param req
 * @param res
 * @param next
 */
export const value_list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      attribute = "",
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
    if (attribute) {
      let attributes = attribute.split(",");
      matchFilter.attribute_id = {
        $in: attributes.map((attr) => new mongoose.Types.ObjectId(attr.trim())),
      };
    }

    if (search_key) {
      matchFilter.$or = [
        { value: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },

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
    ];
    let data;

    if (slug) {
      // Fetch a single product by slug
      data = await AttributeValue.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("AttributeValue not found"));
      }

      data = new AttributeValueResource(data[0]).exec();
    } else {
      data = await AttributeValue.aggregatePaginate(
        AttributeValue.aggregate(pipeline),
        options
      );

      data.docs = await AttributeValueResource.collection(data.docs);
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
