import { StatusError } from "../config/index.js";
import CustomerSession from "../models/CustomerSession.js";
import Order from "../models/Order.js";
import { policy } from "../services/customerSession/index.js";

const allowed = {
  presence: ["online", "offline"],
  active_sessions: ["yes", "no"],
  order_activity: ["none", "one", "repeat"],
  has_email: ["yes", "no"],
  has_mobile: ["yes", "no"],
};

// Apply filters before aggregate pagination so counts describe the complete result.
export function customerDirectoryFilters(query, now = new Date()) {
  for (const [key, values] of Object.entries(allowed)) {
    if (query[key] && !values.includes(query[key]))
      throw StatusError.badRequest(`Invalid ${key} filter`);
  }
  const pipeline = [];
  for (const [key, field] of [
    ["has_email", "email"],
    ["has_mobile", "mobile"],
  ]) {
    if (query[key])
      pipeline.push({
        $match: {
          [field]:
            query[key] === "yes"
              ? { $exists: true, $nin: [null, ""] }
              : { $in: [null, ""] },
        },
      });
  }
  if (query.presence || query.active_sessions) {
    pipeline.push({
      $lookup: {
        from: CustomerSession.collection.name,
        let: { customer: "$_id" },
        as: "_directorySessions",
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$customerId", "$$customer"] },
              revokedAt: null,
              expiresAt: { $gt: now },
              lastActivityAt: { $gt: new Date(+now - policy.idleDays * 864e5) },
            },
          },
          {
            $group: { _id: null, lastActivityAt: { $max: "$lastActivityAt" } },
          },
        ],
      },
    });
    if (query.active_sessions)
      pipeline.push({
        $match: {
          "_directorySessions.0": { $exists: query.active_sessions === "yes" },
        },
      });
    if (query.presence) {
      const online = {
        "_directorySessions.0.lastActivityAt": {
          $gt: new Date(+now - policy.onlineSeconds * 1000),
        },
      };
      pipeline.push({
        $match: query.presence === "online" ? online : { $nor: [online] },
      });
    }
    pipeline.push({ $project: { _directorySessions: 0 } });
  }
  if (query.order_activity) {
    pipeline.push({
      $lookup: {
        from: Order.collection.name,
        let: { customer: "$_id" },
        as: "_directoryOrders",
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$user", "$$customer"] },
              deleted_at: null,
            },
          },
          { $limit: 2 },
          { $project: { _id: 1 } },
        ],
      },
    });
    const size = { $size: "$_directoryOrders" };
    pipeline.push(
      {
        $match: {
          $expr:
            query.order_activity === "repeat"
              ? { $gte: [size, 2] }
              : { $eq: [size, query.order_activity === "one" ? 1 : 0] },
        },
      },
      { $project: { _directoryOrders: 0 } },
    );
  }
  return pipeline;
}

export function customerDirectorySort(field, order, now = new Date()) {
  const direction = Number(order) === 1 ? 1 : -1;
  const pipeline = [];
  let sort;
  if (field === 'order_activity') {
    pipeline.push({ $lookup: {
      from: Order.collection.name, let: { customer: '$_id' }, as: '_sortOrders',
      pipeline: [{ $match: { $expr: { $eq: ['$user', '$$customer'] }, deleted_at: null } },
        { $group: { _id: null, count: { $sum: 1 }, latest: { $max: '$created_at' } } }],
    } }, { $addFields: { _orderCount: { $ifNull: [{ $arrayElemAt: ['$_sortOrders.count', 0] }, 0] }, _lastOrder: { $arrayElemAt: ['$_sortOrders.latest', 0] } } });
    sort = { _orderCount: direction, _lastOrder: direction };
  } else if (field === 'session_activity') {
    pipeline.push({ $lookup: {
      from: CustomerSession.collection.name, let: { customer: '$_id' }, as: '_sortSessions',
      pipeline: [{ $match: { $expr: { $eq: ['$customerId', '$$customer'] }, revokedAt: null, expiresAt: { $gt: now }, lastActivityAt: { $gt: new Date(+now - policy.idleDays * 864e5) } } },
        { $group: { _id: null, count: { $sum: 1 }, latest: { $max: '$lastActivityAt' } } }],
    } }, { $addFields: { _sessionCount: { $ifNull: [{ $arrayElemAt: ['$_sortSessions.count', 0] }, 0] }, _sessionLatest: { $ifNull: [{ $arrayElemAt: ['$_sortSessions.latest', 0] }, null] } } },
    { $addFields: { _online: { $gt: ['$_sessionLatest', new Date(+now - policy.onlineSeconds * 1000)] } } });
    sort = { _online: direction, _sessionCount: direction, _sessionLatest: direction };
  } else if (field === 'source') {
    // Ascending follows the displayed labels: Backup import, Other.
    sort = { imported_from_backup: -direction };
  } else {
    sort = { [['name', 'created_at', 'status', 'email', 'mobile'].includes(field) ? field : 'created_at']: direction };
  }
  pipeline.push({ $sort: { ...sort, _id: -1 } });
  if (field === 'order_activity') pipeline.push({ $project: { _sortOrders: 0, _orderCount: 0, _lastOrder: 0 } });
  if (field === 'session_activity') pipeline.push({ $project: { _sortSessions: 0, _sessionCount: 0, _sessionLatest: 0, _online: 0 } });
  return pipeline;
}
