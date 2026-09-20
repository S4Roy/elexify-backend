import { describe, expect, it } from 'vitest';
import { sourceCondition, sourceExpression } from './filter.js';
import { sourceId } from './plan.js';
import mongoose from 'mongoose';

describe('backup import filtering', () => {
  it('leaves all records unfiltered by default', () => {
    expect(sourceCondition(undefined)).toEqual({});
  });
  it('uses provenance rather than the broader historical migration flag', () => {
    expect(sourceCondition('backup')).toEqual({ $or: [{ 'legacy_import.source': 'eqstoxco_wp434' }] });
    expect(JSON.stringify(sourceCondition('backup'))).not.toContain('is_migrated');
  });
  it('matches earlier reviews by deterministic ObjectId as well as newer tagged reviews', () => {
    const ids = [new mongoose.Types.ObjectId(sourceId('review', '42'))];
    expect(sourceCondition('backup', ids).$or[1]).toEqual({ _id: { $in: ids } });
    expect(sourceExpression(ids).$or[1]).toEqual({ $in: ['$_id', ids] });
    expect(sourceCondition('other', ids)).toEqual({ $nor: [sourceCondition('backup', ids)] });
  });
});

import { list as customersValidator } from '../../validations/admin/customers/list.js';
import { list as ordersValidator } from '../../validations/admin/inventory/order/list.js';
import { list as reviewsValidator } from '../../validations/admin/rating/list.js';
describe('list API filter validation', () => {
  for (const [name, validator] of Object.entries({ customers: customersValidator, orders: ordersValidator, reviews: reviewsValidator })) {
    it(`${name} accepts import filters and rejects unknown sources`, async () => {
      const validate = query => new Promise(resolve => validator({ method: 'GET', headers: {}, query }, {}, resolve));
      expect(await validate({ import_source: 'backup' })).toBeNull();
      expect(await validate({ import_source: 'other' })).toBeNull();
      expect(await validate({ import_source: 'invalid' })).toBeInstanceOf(Error);
    });
  }
});
