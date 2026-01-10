import Consultation from "../../../models/Consultation.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import ConsultationResource from "../../../resources/ConsultationResource.js";
import mongoose from "mongoose";

/**
 *  Consultation
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
    } = req.query;

    const slug = null;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { email: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { phone: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [{ $match: matchFilter }];
    let data;

    data = await Consultation.aggregatePaginate(
      Consultation.aggregate(pipeline),
      options
    );

    data.docs = await ConsultationResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
