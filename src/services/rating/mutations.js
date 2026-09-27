import mongoose from 'mongoose';
import Rating from '../../models/Rating.js';
import Product from '../../models/Product.js';
import ProductVariation from '../../models/ProductVariation.js';
import Media from '../../models/Media.js';
import Order from '../../models/Order.js';
import { StatusError } from '../../config/StatusErrors.js';
import { withRatingProduct, refreshRatingSummary } from './summary.js';

const objectId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export async function verifiedOrderItem(userId, productId, variationId, session) {
  const [proof] = await Order.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), order_status: 'delivered', deleted_at: null } },
    { $lookup: { from: 'order_items', let: { orderId: '$_id' }, pipeline: [
      { $match: { product_id: new mongoose.Types.ObjectId(productId),
        ...(variationId ? { variation_id: new mongoose.Types.ObjectId(variationId) } : {}),
        $expr: { $eq: ['$order_id', '$$orderId'] } } },
      { $limit: 1 }, { $project: { _id: 1 } },
    ], as: 'item' } },
    { $unwind: '$item' }, { $limit: 1 },
    { $project: { _id: 1, order_item_id: '$item._id' } },
  ]).session(session);
  return proof ? { verified_purchase: true, order_id: proof._id, order_item_id: proof.order_item_id }
    : { verified_purchase: false, order_id: null, order_item_id: null };
}

export async function saveRating(userId, body) {
  const { product_id, rating, description, title, media = [] } = body;
  const variation_id = body.variation_id || null;
  if (!objectId(product_id) || (variation_id && !objectId(variation_id)) ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      !Array.isArray(media) || media.length > 5 || new Set(media).size !== media.length || media.some(id => !objectId(id))) {
    throw StatusError.badRequest('Invalid rating, product, variation or media');
  }
  return withRatingProduct(product_id, async session => {
    if (!await Product.exists({ _id: product_id, deleted_at: null }).session(session)) {
      throw StatusError.notFound('Product not found');
    }
    if (variation_id && !await ProductVariation.exists({ _id: variation_id, product_id, deleted_at: null }).session(session)) {
      throw StatusError.badRequest('Variation does not belong to this product');
    }
    if (media.length && await Media.countDocuments({ _id: { $in: media }, created_by: userId,
      reference_type: 'ratings', status: 'active', deleted_at: null }).session(session) !== media.length) {
      throw StatusError.badRequest('Review media must be your own active review uploads');
    }
    let review = await Rating.findOne({ user: userId, product_id, variation_id }).session(session);
    if (review?.deleted_at) throw StatusError.conflict('This review has been removed');
    const created = !review;
    const proof = await verifiedOrderItem(userId, product_id, variation_id, session);
    if (!review) review = new Rating({ user: userId, product_id, variation_id, created_by: userId });
    Object.assign(review, { rating, description, media, ...proof, updated_by: userId, updated_at: new Date() });
    // Older clients do not send titles. Preserve an existing title on their edits.
    if (title !== undefined) review.title = title;
    await review.save({ session });
    await refreshRatingSummary(product_id, variation_id, session);
    return { review, created };
  });
}

export async function moderateRating(id, userId, changes) {
  const existing = await Rating.findById(id).lean();
  if (!existing || existing.deleted_at) throw StatusError.notFound('Rating not found');
  return withRatingProduct(existing.product_id, async session => {
    const review = await Rating.findOneAndUpdate({ _id: id, deleted_at: null }, { $set: {
      ...changes, updated_by: userId, updated_at: new Date(),
    } }, { new: true, runValidators: true, session });
    if (!review) throw StatusError.notFound('Rating not found');
    await refreshRatingSummary(review.product_id, review.variation_id, session);
    return review;
  });
}
