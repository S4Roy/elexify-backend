import Specification from "../../../../models/Specification.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import SpecificationResource from "../../../../resources/SpecificationResource.js";
import mongoose from "mongoose";

/**
 * Add Specification
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
      sort_by = "sort_order",
      sort_order = 1,
      status = null,
    } = req.query;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };
    if (status) {
      matchFilter.status = status;
    }
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [{ $match: matchFilter }];

    const data = await Specification.aggregatePaginate(
      Specification.aggregate(pipeline),
      options
    );

    data.docs = await SpecificationResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`List fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
