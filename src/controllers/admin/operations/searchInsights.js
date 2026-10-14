import SearchEvent from "../../../models/SearchEvent.js";
import { STORE_TIMEZONE, addDaysYmd, istRange, istYmd } from "../../../config/storeTime.js";
import { normalizeQuery } from "../../../services/searchInsights/actions.js";

// Every sort breaks ties by query text so pages stay stable.
const sorts = {
  searches: { searches: -1, _id: 1 },
  zero_results: { zero_results: -1, searches: -1, _id: 1 },
  zero_rate: { zero_rate: -1, zero_results: -1, _id: 1 },
  last_searched: { last_searched: -1, _id: 1 },
};
// Queries with no confirmed count sort below every measured rate.
const zeroRate = { $cond: [{ $gt: ["$measured", 0] }, { $divide: ["$zero_results", "$measured"] }, -1] };

// Shared by the query table and the daily trend so both describe the same events.
function buildMatch(query) {
  const { from, to, platform, filtered } = query;
  const range = istRange(from, to);
  if (range && Object.values(range).some(date => !Number.isFinite(date.getTime()))) return { error: "Invalid date range" };
  if (range?.$gte && range?.$lte && range.$gte > range.$lte) return { error: "From date must precede to date" };
  const eventType = ["search", "suggestion", "legacy"].includes(query.event_type) ? query.event_type : "search";
  const match = eventType === "legacy"
    ? { $or: [{ event_type: "legacy" }, { event_type: { $exists: false } }] }
    : { event_type: eventType };
  if (range) match.created_at = range;
  if (["web", "mobile"].includes(platform)) match.platform = platform;
  if (["true", "false"].includes(filtered)) match.filtered = filtered === "true";
  const q = normalizeQuery(query.q).slice(0, 100);
  if (q) match.query = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
  return { match, eventType, range };
}

const RETENTION_DAYS = 90;

export const trend = async (req, res, next) => {
  try {
    const { match, error } = buildMatch(req.query);
    if (error) return res.status(400).json({ status: "error", message: error });
    const rows = await SearchEvent.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: STORE_TIMEZONE } },
        searches: { $sum: 1 },
        measured: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$result_count", null] }, null] }, 1, 0] } },
        zero_results: { $sum: { $cond: [{ $eq: ["$result_count", 0] }, 1, 0] } },
      } },
      { $sort: { _id: 1 } },
    ]);
    // Fill empty days so the x-axis is continuous; without a from date, start at the first recorded day.
    const byDay = new Map(rows.map(row => [row._id, row]));
    const today = istYmd();
    const end = req.query.to ? istYmd(match.created_at.$lte) : today;
    const earliest = addDaysYmd(end, -(RETENTION_DAYS * 4));
    let day = req.query.from ? istYmd(match.created_at.$gte) : rows[0]?._id ?? end;
    if (day < earliest) day = earliest;
    const days = [];
    for (; day <= end; day = addDaysYmd(day, 1)) {
      const row = byDay.get(day);
      days.push({ date: day, searches: row?.searches ?? 0, measured: row?.measured ?? 0, zero_results: row?.zero_results ?? 0 });
    }
    res.status(200).json({ status: "success", data: { days } });
  } catch (error) { next(error); }
};

export const list = async (req, res, next) => {
  try {
    const { zero_results } = req.query;
    const { match, eventType, error } = buildMatch(req.query);
    if (error) return res.status(400).json({ status: "error", message: error });
    const positiveInteger = (value, fallback) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    const page = Math.min(1000000, positiveInteger(req.query.page, 1));
    const limit = Math.min(100, positiveInteger(req.query.limit, 25));
    const queryFilter = zero_results === "true"
      ? [{ $match: { zero_results: { $gt: 0 } } }]
      : [];
    const sortKey = Object.hasOwn(sorts, req.query.sort) ? req.query.sort : "searches";
    const [data] = await SearchEvent.aggregate([
      { $match: match },
      { $group: {
        _id: "$query",
        searches: { $sum: 1 },
        measured: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$result_count", null] }, null] }, 1, 0] } },
        first_tracked: { $min: "$created_at" },
        zero_results: { $sum: { $cond: [{ $eq: ["$result_count", 0] }, 1, 0] } },
        last_searched: { $max: "$created_at" },
      } },
      { $facet: {
        // Totals cover all queries in the date range, even when the table is filtered.
        summary: [{ $group: {
          _id: null,
          searches: { $sum: "$searches" },
          measured: { $sum: "$measured" },
          first_tracked: { $min: "$first_tracked" },
          zero_results: { $sum: "$zero_results" },
          distinct_queries: { $sum: 1 },
          failing_queries: { $sum: { $cond: [{ $and: [{ $gt: ["$measured", 0] }, { $eq: ["$zero_results", "$measured"] }] }, 1, 0] } },
        } }],
        docs: [
          ...queryFilter,
          ...(sortKey === "zero_rate" ? [{ $addFields: { zero_rate: zeroRate } }] : []),
          { $sort: sorts[sortKey] },
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ],
        count: [...queryFilter, { $count: "total" }],
      } },
    ]);
    const totalDocs = data?.count?.[0]?.total || 0;
    res.status(200).json({ status: "success", data: {
      docs: data?.docs || [], summary: data?.summary?.[0] || { searches: 0, zero_results: 0, measured: 0, distinct_queries: 0, failing_queries: 0 },
      event_type: eventType, sort: sortKey, totalDocs, page, limit, totalPages: Math.ceil(totalDocs / limit),
      hasNextPage: page * limit < totalDocs, hasPrevPage: page > 1,
    } });
  } catch (error) { next(error); }
};
