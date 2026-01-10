import FAQ from "../../../models/FAQ.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import FaqResource from "../../../resources/FaqResource.js";
import mongoose from "mongoose";

/**
 * FAQ List
 * @param req
 * @param res
 * @param next
 */
export const faqList = async (req, res, next) => {
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
    const pipeline = [{ $match: matchFilter }];
    let data;

    // data = await FAQ.aggregatePaginate(FAQ.aggregate(pipeline), options);
    // data.docs = await FaqResource.collection(data.docs);
    data = await FAQ.aggregate(pipeline).sort({ [sort_by]: sort_order });
    data = await FaqResource.collection(data);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: { docs: data },
    });
  } catch (error) {
    next(error);
  }
};
