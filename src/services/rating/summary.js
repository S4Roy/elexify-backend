import mongoose from 'mongoose';
import Rating from '../../models/Rating.js';
import Product from '../../models/Product.js';
import ProductVariation from '../../models/ProductVariation.js';

export const publicRatingFilter = { status: 'approved', deleted_at: null };
export async function ratingSummary(filter, session = null) {
  const rows = await Rating.aggregate([
    { $match: { ...filter, ...publicRatingFilter } },
    { $group: { _id: '$rating', count: { $sum: 1 }, reviews: { $sum: { $cond: [
      { $or: [
        { $ne: [{ $trim: { input: { $ifNull: ['$description', ''] } } }, ''] },
        { $ne: [{ $trim: { input: { $ifNull: ['$title', ''] } } }, ''] },
        { $gt: [{ $size: { $ifNull: ['$media', []] } }, 0] },
      ] }, 1, 0,
    ] } } } },
  ]).session(session);
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map(star => [star, 0]));
  let count = 0, sum = 0, reviews = 0;
  for (const row of rows) {
    if (!Number.isInteger(row._id) || row._id < 1 || row._id > 5) continue;
    distribution[row._id] = row.count;
    count += row.count;
    sum += row._id * row.count;
    reviews += row.reviews;
  }
  return { avg_rating: count ? sum / count : 0, total_ratings: count, total_reviews: reviews, distribution };
}

// Mutations take the product write lock before reading ratings. Concurrent
// writers conflict and retry the whole transaction, including the summary read.
export async function withRatingProduct(productId, work) {
  let result;
  await mongoose.connection.transaction(async session => {
    await Product.updateOne({ _id: productId }, { $inc: { rating_revision: 1 } }, { session });
    result = await work(session);
  });
  return result;
}

export async function refreshRatingSummary(productId, variationId, session, refreshProduct = true) {
  if (refreshProduct) {
    const summary = await ratingSummary({ product_id: new mongoose.Types.ObjectId(productId) }, session);
    await Product.updateOne({ _id: productId }, { $set: {
      avg_rating: summary.avg_rating, total_reviews: summary.total_ratings,
    } }, { session });
  }
  if (variationId) {
    const variation = await ratingSummary({ product_id: new mongoose.Types.ObjectId(productId), variation_id: new mongoose.Types.ObjectId(variationId) }, session);
    await ProductVariation.updateOne({ _id: variationId, product_id: productId }, { $set: {
      avg_rating: variation.avg_rating, total_reviews: variation.total_ratings,
    } }, { session });
  }
}
