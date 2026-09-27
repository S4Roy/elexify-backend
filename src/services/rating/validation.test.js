import { describe, it, expect } from 'vitest';
import { add } from '../../validations/user/rating/add.js';
import { edit } from '../../validations/admin/rating/edit.js';
import { ratingList } from '../../validations/site/cms/rating-list.js';
import Rating from '../../models/Rating.js';
import { generateStructuredData } from '../seo/generateStructuredData.js';
const id = '123456789012345678901234';
const validate = (middleware, values, segment = 'body') => new Promise(resolve => middleware({ method: segment === 'query' ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, [segment]: values }, {}, error => resolve(error)));
describe('review input and SEO contract', () => {
  it.each([0, 6, 2.5, NaN])('rejects invalid star value %s in both validation layers', async rating => {
    expect(await validate(add, { product_id: id, rating })).toBeTruthy();
    expect(new Rating({ user: id, product_id: id, rating }).validateSync()).toBeTruthy();
  });
  it.each([
    { product_id: 'bad' }, { variation_id: 'bad' }, { media: [id, id] },
    { media: Array(6).fill(id) }, { description: 'a'.repeat(2001) }, { title: 'a'.repeat(201) },
    { verified_purchase: true }, { order_item_id: id }, { order_id: id },
  ])('rejects invalid/forged payload %j', async extra => {
    expect(await validate(add, { product_id: id, rating: 4, ...extra })).toBeTruthy();
  });
  it('accepts existing mobile payload and optional title/media', async () => {
    expect(await validate(add, { product_id: id, variation_id: null, rating: 4 })).toBeFalsy();
    expect(await validate(add, { product_id: id, rating: 5, title: 'Nice', media: [id] })).toBeFalsy();
  });
  it.each([null, '', 'hidden', undefined])('requires an explicit valid moderation status %s', async status => {
    expect(await validate(edit, { _id: id, status })).toBeTruthy();
  });
  it.each([{ page: 0 }, { page: 1.5 }, { limit: 101 }, { product_id: 'bad' }, { rating: 6 }, { sort_by: '$where' }])('bounds public reads %j', async query => {
    expect(await validate(ratingList, query, 'query')).toBeTruthy();
  });
  it('uses ratingCount rather than misrepresenting rating-only entries as written reviews', () => {
    const schema = generateStructuredData({ name: 'Example', avg_rating: 4.25, total_reviews: 4 }, {});
    expect(schema.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: '4.25', ratingCount: '4' });
    expect(generateStructuredData({ name: 'Example', avg_rating: 0, total_reviews: 0 }, {}).aggregateRating).toBeUndefined();
  });
});
