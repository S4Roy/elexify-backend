import DeviceToken from "../../../models/DeviceToken.js";
import { pushConfig } from "../../../services/notification/push/config.js";
import Order from "../../../models/Order.js";
import { customerActivityPipeline } from "../../../helpers/order/customerActivity.js";
import { sourceCondition, sourceExpression } from '../../../services/legacyImport/filter.js';
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

    const importSource = req.query.import_source;
    if (importSource && !['backup', 'other'].includes(importSource)) throw StatusError.badRequest('Invalid import source filter');
    let importedReviewIds = [];
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null, role: "customer" };

    if (importSource) matchFilter.$and = [sourceCondition(importSource, importedReviewIds)];
    if (search_key) {
      const escapedSearch = search_key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchFilter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
        { mobile: { $regex: escapedSearch, $options: "i" } },
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
    const pipeline = [{ $match: matchFilter }, { $addFields: { imported_from_backup: sourceExpression() } }];
    let data;

    data = await User.aggregatePaginate(User.aggregate(pipeline), options);

    const activity = data.docs.length
      ? await Order.aggregate(customerActivityPipeline(data.docs.map(doc => doc._id)))
      : [];
    const push = await pushConfig();
    const deviceCounts = data.docs.length && push.environment && push.projectId
      ? await DeviceToken.aggregate([
          { $match: { user_id: { $in: data.docs.map(doc => doc._id) }, environment: push.environment, project_id: push.projectId, is_active: true } },
          { $group: { _id: "$user_id", count: { $sum: 1 } } },
        ]) : [];
    const devicesByUser = new Map(deviceCounts.map(row => [String(row._id), row.count]));
    const activityByUser = new Map(activity.map(row => [String(row._id), row]));
    data.docs = (await UserResource.collection(data.docs)).map(doc => ({
      ...doc,
      push_device_count: devicesByUser.get(String(doc._id)) ?? 0,
      order_count: activityByUser.get(String(doc._id))?.order_count ?? 0,
      last_order_at: activityByUser.get(String(doc._id))?.last_order_at ?? null,
    }));

    res.status(201).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
