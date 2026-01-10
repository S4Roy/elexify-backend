import Media from "../../../models/Media.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import MediaResource from "../../../resources/MediaResource.js";
import mongoose from "mongoose";

/**
 * Media List
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
      parent_category = null,
      id_includes = null,
      slug: querySlug = null, // alias to avoid name collision
      reference_type,
    } = req.query;
    const { slug: paramSlug = null } = req.params;
    let idsArray = [];

    const slug = paramSlug;
    if (typeof id_includes === "string") {
      idsArray = id_includes
        .split(",")
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };
    if (idsArray.length) {
      matchFilter._id = { $in: idsArray };
    }
    if (slug) {
      matchFilter.slug = slug;
    }
    if (reference_type) {
      matchFilter.reference_type = reference_type;
    }
    if (querySlug) {
      let existingCategory = await Media.findOne({ slug: querySlug }).exec();
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
    const pipeline = [{ $match: matchFilter }];
    let data;

    if (slug) {
      // Fetch a single product by slug
      data = await Media.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Media not found"));
      }

      data = new MediaResource(data[0]).exec();
    } else {
      data = await Media.aggregatePaginate(Media.aggregate(pipeline), options);

      data.docs = await MediaResource.collection(data.docs);
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
