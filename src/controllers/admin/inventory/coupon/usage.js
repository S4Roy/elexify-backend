import mongoose from 'mongoose';
import CouponUsage from '../../../../models/CouponUsage.js';

export const buildUsagePipeline = (query) => {
  const match = {};
  if (query.coupon) match.coupon = new mongoose.Types.ObjectId(query.coupon);
  if (query.status) match.status = query.status;
  if (query.from_date || query.to_date) {
    match.applied_at = {};
    if (query.from_date) match.applied_at.$gte = new Date(query.from_date);
    if (query.to_date) match.applied_at.$lte = new Date(query.to_date);
  }
  const pipeline = [{ $match: match }];
  for (const [from, localField, as, fields] of [
    ['coupons', 'coupon', 'coupon_details', { code: 1, title: 1 }],
    ['users', 'user', 'customer', { name: 1 }],
    ['orders', 'order', 'order_details', { id: 1, order_status: 1, payment_status: 1 }],
  ]) {
    pipeline.push({ $lookup: { from, localField, foreignField: '_id', pipeline: [{ $project: fields }], as } });
    pipeline.push({ $unwind: { path: '$' + as, preserveNullAndEmptyArrays: true } });
  }
  if (query.search_key) {
    const literal = query.search_key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pipeline.push({ $match: { $or: ['email', 'customer.name', 'coupon_details.code', 'order_details.id'].map(field => ({ [field]: { $regex: literal, $options: 'i' } })) } });
  }
  const page = Number(query.page || 1), limit = Number(query.limit || 25);
  pipeline.push({ $facet: {
    docs: [
      { $sort: { applied_at: Number(query.sort_order || -1), _id: Number(query.sort_order || -1) } },
      { $skip: (page - 1) * limit }, { $limit: limit },
      { $project: { coupon: 1, email: 1, order: 1, discount_amount: 1, currency: 1, status: 1, applied_at: 1, coupon_details: 1, customer: 1, order_details: 1 } },
    ],
    count: [{ $count: 'total' }],
    summary: [{ $group: { _id: { currency: '$currency', status: '$status' }, count: { $sum: 1 }, discount_amount: { $sum: '$discount_amount' } } }, { $sort: { '_id.currency': 1, '_id.status': 1 } }],
  } });
  return pipeline;
};

export const usage = async (req, res, next) => {
  try {
    const [result] = await CouponUsage.aggregate(buildUsagePipeline(req.query));
    const page = Number(req.query.page || 1), limit = Number(req.query.limit || 25);
    const totalDocs = result?.count[0]?.total || 0;
    const totalPages = Math.ceil(totalDocs / limit);
    res.json({ status: 'success', data: {
      docs: result?.docs || [], summary: result?.summary || [],
      totalDocs, page, limit, totalPages, pagingCounter: (page - 1) * limit + 1,
      hasPrevPage: page > 1, hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : null, nextPage: page < totalPages ? page + 1 : null,
    } });
  } catch (error) { next(error); }
};
