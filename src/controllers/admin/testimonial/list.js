import Testimonial from "../../../models/Testimonial.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import TestimonialResource from "../../../resources/TestimonialResource.js";
import mongoose from "mongoose";

/**
 * Testimonial List
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
      parent_category = null,
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

        { status: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [{ $match: matchFilter }];
    let data;
    if (slug) {
      pipeline.push({ $match: { slug: slug } });
    }
    if (slug || _id) {
      data = await Testimonial.aggregate(pipeline);
      data = new TestimonialResource(data[0]).exec() ?? {};
      data.slug = slug;
    } else {
      data = await Testimonial.aggregatePaginate(
        Testimonial.aggregate(pipeline),
        options
      );
      data.docs = await TestimonialResource.collection(data.docs);
    }

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
