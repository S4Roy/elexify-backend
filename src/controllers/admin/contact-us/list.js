import ContactUs from "../../../models/ContactUs.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import ContactUsResource from "../../../resources/ContactUsResource.js";
import mongoose from "mongoose";
import { istRange } from "../../../config/storeTime.js";

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
      priority = null,
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
      const escapedSearch = String(search_key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchFilter.$or = ["name", "email", "phone", "subject", "message"].map(field => ({
        [field]: { $regex: escapedSearch, $options: "i" },
      }));
    }
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }
    if (priority === 'normal') matchFilter.$and = [{ $or: [{ priority: 'normal' }, { priority: { $exists: false } }] }];
    else if (priority) matchFilter.priority = priority;
    if (from_date || to_date) matchFilter.created_at = istRange(from_date, to_date);
    const pipeline = [{ $match: matchFilter }, { $lookup: {
      from: 'contact_us_messages', let: { contactId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$contact_id', '$$contactId'] } } },
        { $sort: { created_at: -1, _id: -1 } }, { $limit: 1 },
        { $project: { kind: 1, created_at: 1, author_name: 1, delivery_status: 1 } },
      ], as: 'latest_message',
    } }, { $set: { latest_message: { $arrayElemAt: ['$latest_message', 0] } } }];
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
