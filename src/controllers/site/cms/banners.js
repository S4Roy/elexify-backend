import Banner from "../../../models/Banner.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import BannerResource from "../../../resources/BannerResource.js";
import mongoose from "mongoose";

/**
 * Banner List
 * @param req
 * @param res
 * @param next
 */
export const banners = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
    } = req.query;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null, status: "active" };

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },

        { status: { $regex: ".*" + search_key + ".*", $options: "i" } },
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
      { $unwind: { path: "$image", preserveNullAndEmptyArrays: true } },
    ];
    let data;

    // data = await Banner.aggregatePaginate(Banner.aggregate(pipeline), options);
    // data.docs = await BannerResource.collection(data.docs);
    data = await Banner.aggregate(pipeline).sort({ [sort_by]: sort_order });
    data = await BannerResource.collection(data);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: { docs: data },
    });
  } catch (error) {
    next(error);
  }
};
