import { describe, expect, it } from 'vitest';
import { list } from './list.js';

const validate = query => new Promise(resolve => list({ query, method: 'GET', headers: {} }, {}, resolve));
const filters = {
  presence: ['online', 'offline'], active_sessions: ['yes', 'no'],
  order_activity: ['none', 'one', 'repeat'], has_email: ['yes', 'no'], has_mobile: ['yes', 'no'],
};
describe('customer list query validation', () => {
  for (const [key, values] of Object.entries(filters)) {
    it(`accepts every supported ${key} value and rejects invalid values`, async () => {
      for (const value of [...values, '', null]) expect(await validate({ [key]: value })).toBeNull();
      expect(await validate({ [key]: 'invalid' })).toBeTruthy();
    });
  }
  it('accepts new and existing filters together', async () => {
    expect(await validate({ presence: 'offline', active_sessions: 'yes', order_activity: 'repeat', has_email: 'yes', has_mobile: 'no', import_source: 'backup', status: 'active', email_verified: 'yes', mobile_verified: 'no', from_date: '2026-01-01', to_date: '2026-09-26', page: '1', limit: '25', sort_by: 'name', sort_order: '1', search_key: 'Customer' })).toBeNull();
  });
  it('accepts all sortable activity columns', async () => {
    for (const sort_by of ['order_activity', 'session_activity', 'source', 'status']) expect(await validate({ sort_by, sort_order: -1 })).toBeNull();
  });
  it('continues rejecting unknown parameters', async () => {
    expect(await validate({ unexpected: 'yes' })).toBeTruthy();
  });
});
