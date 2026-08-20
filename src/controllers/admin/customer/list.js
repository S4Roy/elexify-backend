import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import UserResource from "../../../resources/UserResource.js";
import mongoose from "mongoose";

/**
 *  User
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
      parent_brand = null,
      slug: querySlug = null, // alias to avoid name collision
      status = null,
      from_date = null,
      to_date = null,
      email_verified = null,
      mobile_verified = null,
    } = req.query;
    const { slug: paramSlug = null } = req.params;

    const slug = paramSlug;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null, role: "customer" };

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { email: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { mobile: { $regex: ".*" + search_key + ".*", $options: "i" } },
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
    if (email_verified) {
      matchFilter.email_verified_at =
        email_verified === "yes" ? { $ne: null } : null;
    }
    if (mobile_verified) {
      matchFilter.mobile_verified_at =
        mobile_verified === "yes" ? { $ne: null } : null;
    }
    const pipeline = [{ $match: matchFilter }];
    let data;

    data = await User.aggregatePaginate(User.aggregate(pipeline), options);

    data.docs = await UserResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
