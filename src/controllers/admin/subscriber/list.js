import Subscriber from "../../../models/Subscriber.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import SubscriberResource from "../../../resources/SubscriberResource.js";
import mongoose from "mongoose";

/**
 * Subscriber List
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
      _id = null,
    } = req.query;
    const { slug = null } = req.params;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };

    if (search_key) {
      matchFilter.$or = [
        { email: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { status: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [{ $match: matchFilter }];
    let data;

    data = await Subscriber.aggregatePaginate(
      Subscriber.aggregate(pipeline),
      options
    );
    data.docs = await SubscriberResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
