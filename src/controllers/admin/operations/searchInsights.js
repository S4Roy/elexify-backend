import SearchEvent from "../../../models/SearchEvent.js";
import { istRange } from "../../../config/storeTime.js";

export const list = async (req, res, next) => {
  try {
    const { from, to, zero_results } = req.query;
    const range = istRange(from, to);
    if (range && Object.values(range).some(date => !Number.isFinite(date.getTime()))) {
      return res.status(400).json({ status: "error", message: "Invalid date range" });
    }
    if (range?.$gte && range?.$lte && range.$gte > range.$lte) {
      return res.status(400).json({ status: "error", message: "From date must precede to date" });
    }
    const positiveInteger = (value, fallback) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    const page = Math.min(1000000, positiveInteger(req.query.page, 1));
    const limit = Math.min(100, positiveInteger(req.query.limit, 25));
    const [data] = await SearchEvent.aggregate([
      { $match: range ? { created_at: range } : {} },
      { $facet: {
        summary: [{ $group: { _id: null, searches: { $sum: 1 }, zero_results: { $sum: { $cond: [{ $eq: ["$result_count", 0] }, 1, 0] } } } }],
        queries: [
          { $group: { _id: "$query", searches: { $sum: 1 }, zero_results: { $sum: { $cond: [{ $eq: ["$result_count", 0] }, 1, 0] } }, last_searched: { $max: "$created_at" } } },
          ...(zero_results === "true" ? [{ $match: { zero_results: { $gt: 0 } } }] : []),
          { $sort: { searches: -1, _id: 1 } },
          { $facet: { docs: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: "total" }] } },
        ],
      } },
    ]);
    const rows = data?.queries?.[0];
    const totalDocs = rows?.count?.[0]?.total || 0;
    res.status(200).json({ status: "success", data: {
      docs: rows?.docs || [], summary: data?.summary?.[0] || { searches: 0, zero_results: 0 },
      totalDocs, page, limit, totalPages: Math.ceil(totalDocs / limit),
      hasNextPage: page * limit < totalDocs, hasPrevPage: page > 1,
    } });
  } catch (error) { next(error); }
};
