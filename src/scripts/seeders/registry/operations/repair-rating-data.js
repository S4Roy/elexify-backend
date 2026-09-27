import Rating from '../../../../models/Rating.js';
import Product from '../../../../models/Product.js';
import ProductVariation from '../../../../models/ProductVariation.js';
import OrderItem from '../../../../models/OrderItem.js';
import { withRatingProduct, refreshRatingSummary } from '../../../../services/rating/summary.js';
import { PERMISSIONS } from '../../../../constants/adminPermissions.js';

export async function repairRatingData(context) {
  const duplicates = await Rating.aggregate([
    { $group: { _id: { user: '$user', product_id: '$product_id', variation_id: { $ifNull: ['$variation_id', null] } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $limit: 20 },
  ]);
  const invalid = await Rating.countDocuments({ $or: [
    { rating: { $nin: [1, 2, 3, 4, 5] } },
    { variation_id: { $exists: true, $ne: null, $not: { $type: 'objectId' } } },
  ] });
  const products = await Product.countDocuments();
  const preflight = { safe_to_repair: duplicates.length === 0 && invalid === 0,
    duplicate_groups_sample: duplicates, invalid_records: invalid };
  if (context.dryRun) return { wouldInsert: 0, wouldUpdate: products, wouldSkip: 0, wouldDelete: 0, preflight };
  if (!preflight.safe_to_repair) throw new Error('Rating repair blocked: resolve duplicate identities or invalid records manually; run dry-run for details.');

  // Only replace the known invalid partial index. Never sync/drop unrelated indexes.
  const indexes = await Rating.collection.indexes();
  const old = indexes.find(index => index.name === 'user_1_product_id_1_variation_id_1');
  if (old && old.partialFilterExpression?.variation_id?.$type !== 'objectId') {
    await Rating.collection.dropIndex(old.name);
  }
  await Rating.createIndexes();
  await OrderItem.collection.createIndex({ order_id: 1, product_id: 1, variation_id: 1 });
  let updated = 0;
  for await (const product of Product.find().select('_id').lean().cursor()) {
    await withRatingProduct(product._id, async session => {
      await refreshRatingSummary(product._id, null, session);
      const variations = await ProductVariation.find({ product_id: product._id }).select('_id').session(session).lean();
      for (const variation of variations) await refreshRatingSummary(product._id, variation._id, session, false);
    });
    updated++;
  }
  return { inserted: 0, updated, skipped: 0, deleted: 0 };
}

export default {
  key: 'repair-rating-data', name: 'Repair rating indexes and public aggregates',
  description: 'Preflight review identities, repair the variation uniqueness index and rebuild approved non-deleted product/variation rating caches.',
  type: 'REPAIR', category: 'database', version: 1, required: false, idempotent: true,
  risk: 'MEDIUM', allowedEnvironments: ['development', 'test', 'production'], dependencies: [],
  estimatedImpact: 'Scans review identities and repairs caches per product using transactions. Does not delete or merge reviews. Requires a replica set.',
  supportsDryRun: true, requiresConfirmation: true, permission: PERMISSIONS.REPAIR_EXECUTE, handler: repairRatingData,
};
