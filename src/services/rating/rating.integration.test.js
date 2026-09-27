import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import Rating from '../../models/Rating.js';
import Product from '../../models/Product.js';
import ProductVariation from '../../models/ProductVariation.js';
import Order from '../../models/Order.js';
import OrderItem from '../../models/OrderItem.js';
import Media from '../../models/Media.js';
import { saveRating, moderateRating } from './mutations.js';
import { ratingSummary } from './summary.js';
import { ratingList } from '../../controllers/site/cms/rating-list.js';
import { list as ownList } from '../../controllers/user/rating/list.js';
import { repairRatingData } from '../../scripts/seeders/registry/operations/repair-rating-data.js';
import { generateStructuredData } from '../seo/generateStructuredData.js';

const uri = process.env.RATING_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
let product, variation, user, other;
const oid = () => new mongoose.Types.ObjectId();
const submit = (extra = {}, actor = user) => saveRating(String(actor), { product_id: String(product._id), rating: 5, ...extra });
const invoke = async (controller, query, auth = user) => {
  let data, status;
  await controller({ query, params: {}, auth: { user_id: String(auth) }, __: value => value },
    { status(code) { status = code; return this; }, json(value) { data = value.data; } }, error => { throw error; });
  return { data, status };
};
const purchase = async (actor = user, status = 'delivered', variationId = variation._id) => {
  const order = await Order.create({ id: String(oid()), user: actor, order_status: status, payment_method: 'cod', payment_status: 'paid', total_amount: 100, grand_total: 100 });
  const item = await OrderItem.create({ order_id: order._id, product_id: product._id, variation_id: variationId, quantity: 1, unit_price: 100, total_price: 100 });
  return { order, item };
};

suite('rating integrity and public lifecycle (real replica set)', () => {
  beforeAll(async () => {
    const parsed = new URL(uri);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.includes('rating_test')) throw new Error('Use a disposable local rating_test database');
    await mongoose.connect(uri, { autoIndex: false });
    await Rating.createIndexes();
    await OrderItem.createIndexes();
  });
  beforeEach(async () => {
    for (const model of [Rating, Product, ProductVariation, Order, OrderItem, Media]) await model.deleteMany({});
    user = oid(); other = oid();
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection.collection('users').insertMany([{ _id: user, name: 'Author', email: 'private@example.test' }, { _id: other, name: 'Other', email: 'other@example.test' }]);
    product = await Product.create({ name: 'Test', sku: String(oid()), slug: String(oid()), regular_price: 100, status: 'active' });
    // The feature only depends on identity/relationship; bypass unrelated variation requirements.
    const id = oid();
    await ProductVariation.collection.insertOne({ _id: id, product_id: product._id, deleted_at: null });
    variation = { _id: id };
  });
  afterAll(async () => { await mongoose.disconnect(); });

  it('preserves non-purchase eligibility, title, timestamp and auto-approval', async () => {
    const { review, created } = await submit({ title: 'Good', description: 'Works' });
    expect(created).toBe(true);
    expect(review).toMatchObject({ title: 'Good', verified_purchase: false, status: 'approved' });
    const changed = await submit({ rating: 2 });
    expect(changed.created).toBe(false);
    expect(changed.review.title).toBe('Good');
    expect(changed.review.updated_at.getTime()).toBeGreaterThanOrEqual(review.updated_at.getTime());
    expect(await Rating.countDocuments()).toBe(1);
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 2, total_reviews: 1 });
  });
  it('ignores forged verification/status and derives trusted delivered ownership', async () => {
    await purchase(other);
    await purchase(user, 'confirmed');
    expect((await submit({ verified_purchase: true, status: 'rejected' })).review.verified_purchase).toBe(false);
    const { order, item } = await purchase();
    const { review } = await submit({ variation_id: String(variation._id) });
    expect(review.verified_purchase).toBe(true);
    expect(String(review.order_id)).toBe(String(order._id));
    expect(String(review.order_item_id)).toBe(String(item._id));
  });
  it('does not verify a different variation or deleted order', async () => {
    await purchase(user, 'delivered', oid());
    expect((await submit({ variation_id: String(variation._id) })).review.verified_purchase).toBe(false);
    const { order } = await purchase();
    await Order.updateOne({ _id: order._id }, { $set: { deleted_at: new Date() } });
    expect((await submit({ variation_id: String(variation._id) })).review.verified_purchase).toBe(false);
  });
  it('rejects unknown products, foreign variations and fractional ratings', async () => {
    await expect(submit({ product_id: String(oid()) })).rejects.toMatchObject({ statusCode: 404 });
    await expect(submit({ variation_id: String(oid()) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(submit({ rating: 4.5 })).rejects.toMatchObject({ statusCode: 400 });
  });
  it('enforces media ownership, purpose, uniqueness and count', async () => {
    const media = await Media.create({ reference_type: 'ratings', created_by: other, url: 'ratings/test.png' });
    await expect(submit({ media: [String(media._id)] })).rejects.toMatchObject({ statusCode: 400 });
    await Media.updateOne({ _id: media._id }, { created_by: user, reference_type: 'return_requests' });
    await expect(submit({ media: [String(media._id)] })).rejects.toMatchObject({ statusCode: 400 });
    await Media.updateOne({ _id: media._id }, { reference_type: 'ratings' });
    await expect(submit({ media: Array(6).fill(String(media._id)) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(submit({ media: [String(media._id), String(media._id)] })).rejects.toMatchObject({ statusCode: 400 });
    expect((await submit({ media: [String(media._id)] })).review.media).toHaveLength(1);
  });
  it('updates both caches on reject, approve, edit and last-review deletion', async () => {
    const { review } = await submit({ variation_id: String(variation._id) });
    await moderateRating(review._id, other, { status: 'rejected' });
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 0, total_reviews: 0 });
    expect(await ProductVariation.findById(variation._id)).toMatchObject({ avg_rating: 0, total_reviews: 0 });
    await submit({ variation_id: String(variation._id), rating: 3 });
    expect((await Rating.findById(review._id)).status).toBe('rejected');
    await moderateRating(review._id, other, { status: 'approved' });
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 3, total_reviews: 1 });
    await moderateRating(review._id, other, { deleted_at: new Date(), deleted_by: other });
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 0, total_reviews: 0 });
    await expect(submit({ variation_id: String(variation._id) })).rejects.toMatchObject({ statusCode: 409 });
    expect(generateStructuredData(await Product.findById(product._id), {}).aggregateRating).toBeUndefined();
  });
  it('serializes simultaneous edits without duplicates or stale aggregates', async () => {
    await Promise.all([submit({ rating: 1 }), submit({ rating: 5 }), submit({ rating: 3 }, other)]);
    expect(await Rating.countDocuments()).toBe(2);
    const summary = await ratingSummary({ product_id: product._id });
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: summary.avg_rating, total_reviews: 2 });
    await expect(Rating.create({ user, product_id: product._id, variation_id: null, rating: 3 })).rejects.toMatchObject({ code: 11000 });
  });
  it('keeps concurrent moderation and submission consistent', async () => {
    const { review } = await submit();
    await Promise.all([moderateRating(review._id, other, { status: 'rejected' }), submit({ rating: 2 })]);
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 0, total_reviews: 0 });
  });
  it('paginates sorted public reviews without email and keeps summary unfiltered', async () => {
    await submit({ rating: 5, title: 'Excellent' });
    await submit({ rating: 1 }, other);
    const { data } = await invoke(ratingList, { product_id: String(product._id), page: 1, limit: 1, sort_by: 'rating', sort_order: 1 });
    expect(data.docs).toHaveLength(1);
    expect(data.docs[0].rating).toBe(1);
    expect(data.docs[0].user.email).toBeUndefined();
    expect(data).toMatchObject({ totalDocs: 2, hasNextPage: true, summary: { total_ratings: 2, total_reviews: 1, avg_rating: 3, distribution: { 1: 1, 5: 1 } } });
    const filtered = await invoke(ratingList, { product_id: String(product._id), rating: 5 });
    expect(filtered.data.docs[0].title).toBe('Excellent');
    expect(filtered.data.totalDocs).toBe(1);
    expect(filtered.data.summary.total_ratings).toBe(2);
  });
  it('filters verified/media and literal search without leaking nonpublic records', async () => {
    await purchase();
    const { review } = await submit({ description: 'a.*' });
    await submit({}, other);
    expect((await invoke(ratingList, { product_id: String(product._id), verified_purchase: true })).data.totalDocs).toBe(1);
    expect((await invoke(ratingList, { product_id: String(product._id), with_media: true })).data.totalDocs).toBe(0);
    expect((await invoke(ratingList, { product_id: String(product._id), search_key: 'a.*' })).data.totalDocs).toBe(1);
    await moderateRating(review._id, other, { status: 'rejected' });
    expect((await invoke(ratingList, { product_id: String(product._id) })).data.totalDocs).toBe(1);
    const own = await invoke(ownList, { product_id: String(product._id) });
    expect(own.data.docs).toHaveLength(1);
    expect(String(own.data.docs[0].user._id)).toBe(String(user));
    expect(own.data.docs[0].status).toBe('rejected');
  });
  it('dry-runs without writes and repairs legacy caches including empty variations', async () => {
    await submit();
    await Product.updateOne({ _id: product._id }, { avg_rating: 1, total_reviews: 99 });
    await ProductVariation.updateOne({ _id: variation._id }, { avg_rating: 4, total_reviews: 99 });
    expect((await repairRatingData({ dryRun: true })).preflight.safe_to_repair).toBe(true);
    expect((await Product.findById(product._id)).total_reviews).toBe(99);
    await repairRatingData({ dryRun: false });
    expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 5, total_reviews: 1 });
    expect(await ProductVariation.findById(variation._id)).toMatchObject({ avg_rating: 0, total_reviews: 0 });
    expect(generateStructuredData(await Product.findById(product._id), {}).aggregateRating).toMatchObject({ ratingCount: '1', ratingValue: '5' });
  });
  it('rolls back review and product changes if a variation cache write fails', async () => {
    const update = vi.spyOn(ProductVariation, 'updateOne').mockRejectedValueOnce(new Error('injected cache failure'));
    try {
      await expect(submit({ variation_id: String(variation._id) })).rejects.toThrow('injected cache failure');
      expect(await Rating.countDocuments()).toBe(0);
      expect(await Product.findById(product._id)).toMatchObject({ avg_rating: 0, total_reviews: 0 });
    } finally { update.mockRestore(); }
  });
  it('excludes pending and deleted reviews from summary, pages and SEO cache', async () => {
    const { review } = await submit({ description: 'Pending content' });
    await moderateRating(review._id, other, { status: 'pending' });
    const { data } = await invoke(ratingList, { product_id: String(product._id) });
    expect(data.docs).toEqual([]);
    expect(data.summary).toMatchObject({ total_ratings: 0, total_reviews: 0, avg_rating: 0 });
    expect(data).toMatchObject({ totalPages: 1, hasNextPage: false });
    expect(generateStructuredData(await Product.findById(product._id), {}).aggregateRating).toBeUndefined();
  });
  it('blocks data repair on invalid historical records without silently rewriting them', async () => {
    await Rating.collection.insertOne({ user, product_id: product._id, rating: 7 });
    expect((await repairRatingData({ dryRun: true })).preflight.safe_to_repair).toBe(false);
    await expect(repairRatingData({ dryRun: false })).rejects.toThrow('Rating repair blocked');
    expect((await Rating.findOne()).rating).toBe(7);
  });
  it('uses the public compound index for recent review pages', async () => {
    await submit();
    const explained = await Rating.find({ product_id: product._id, status: 'approved', deleted_at: null })
      .sort({ created_at: -1, _id: -1 }).limit(10).hint({ product_id: 1, status: 1, deleted_at: 1, created_at: -1, _id: -1 }).explain('executionStats');
    const plan = JSON.stringify(explained.queryPlanner.winningPlan);
    expect(plan).toContain('IXSCAN');
    expect(plan).not.toContain('"stage":"SORT"');
  });

});
