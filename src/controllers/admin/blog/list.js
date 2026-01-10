import Blog from "../../../models/Blog.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import BlogResource from "../../../resources/BlogResource.js";
import mongoose from "mongoose";

/**
 * List Blog
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
      slug,
      _id,
    } = req.query;
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };
    if (slug) {
      matchFilter.slug = slug;
    }
    if (_id) {
      matchFilter._id = mongoose.Types.ObjectId(_id);
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
          from: "medias",
          localField: "feature_image",
          foreignField: "_id",
          as: "feature_image",
        },
      },
      {
        $unwind: {
          path: "$feature_image",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "created_by",
        },
      },
      {
        $unwind: {
          path: "$created_by",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    let data;

    if (slug || _id) {
      // Fetch a single product by slug
      pipeline.push({
        $lookup: {
          from: "blogs",
          localField: "related_blogs",
          foreignField: "_id",
          as: "related_blogs",
        },
      });
      data = await Blog.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Blog not found"));
      }

      data = new BlogResource(data[0]).exec();
    } else {
      data = await Blog.aggregatePaginate(Blog.aggregate(pipeline), options);

      data.docs = await BlogResource.collection(data.docs);
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
