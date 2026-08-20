import ContactUs from "../../../models/ContactUs.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import ContactUsResource from "../../../resources/ContactUsResource.js";
import mongoose from "mongoose";

/**
 * ContactUs List
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
      status = null,
      from_date = null,
      to_date = null,
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
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { code: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { status: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }
    if (from_date || to_date) {
      matchFilter.created_at = {};
      if (from_date) matchFilter.created_at.$gte = new Date(from_date);
      if (to_date) {
        const end = new Date(to_date);
        end.setHours(23, 59, 59, 999);
        matchFilter.created_at.$lte = end;
      }
    }
    const pipeline = [{ $match: matchFilter }];
    let data;
    if (slug) {
      pipeline.push({ $match: { slug: slug } });
    }

    data = await ContactUs.aggregatePaginate(
      ContactUs.aggregate(pipeline),
      options
    );
    data.docs = await ContactUsResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
