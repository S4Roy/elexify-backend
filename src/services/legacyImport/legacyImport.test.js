import { describe, it, expect } from 'vitest';
import { parseValues } from './source.js';
import { buildPlan } from './plan.js';
const target = () => ({ users: [], products: [], variations: [], orders: [], reviews: [] });
const source = () => ({ fingerprint: 'fixture', tables: { users: [{ ID: '1', user_email: 'customer@example.test', display_name: 'Customer', user_registered: '2020-01-01 00:00:00' }], usermeta: [{ user_id: '1', meta_key: 'wpgh_capabilities', meta_value: 'a:1:{s:8:"customer";b:1;}' }], posts: [], postmeta: [], comments: [], commentmeta: [], woocommerce_order_items: [], woocommerce_order_itemmeta: [] } });
describe('SQL data parsing', () => {
  it('handles escapes, commas, SQL-looking strings and NULL without executing them', () => {
    expect(parseValues("(1, 'a,b; DROP TABLE x', 'it\\'s', NULL), (2, 'two''quotes', 'line\\nnext', -2.50);")).toEqual([['1', 'a,b; DROP TABLE x', "it's", null], ['2', "two'quotes", 'line\nnext', '-2.50']]);
  });
  it('rejects expressions, truncated data and trailing statements', () => {
    for (const sql of ["(1, NOW());", "(1, 'oops);", '(1); DROP TABLE users;']) expect(() => parseValues(sql)).toThrow();
  });
});
describe('missing-only migration planning', () => {
  it('creates a customer without a password, verification flags or privileges', () => {
    const plan = buildPlan(source(), target());
    expect(plan.summary.customers.missing).toBe(1);
    expect(plan.groups[0].docs[0].doc).toMatchObject({ role: 'customer', email: 'customer@example.test' });
    expect(plan.groups[0].docs[0].doc).not.toHaveProperty('password');
    expect(plan.groups[0].docs[0].doc).not.toHaveProperty('email_verified_at');
  });
  it('is repeatable and skips existing customers', () => {
    const s = source(), t = target(), first = buildPlan(s, t);
    expect(buildPlan(s, t).fingerprint).toBe(first.fingerprint);
    t.users.push(first.groups[0].docs[0].doc);
    expect(buildPlan(s, t).summary.customers).toEqual({ total: 1, missing: 0, existing: 1, blocked: 0 });
  });
  it('blocks duplicate source emails and staff account matches', () => {
    const s = source(); s.tables.users.push({ ...s.tables.users[0], ID: '2' });
    expect(buildPlan(s, target()).summary.customers.blocked).toBe(1);
    const t = target(); t.users.push({ _id: 'staff', email: 'customer@example.test', role: 'superadmin' });
    expect(buildPlan(source(), t).summary.customers.blocked).toBe(1);
  });
  it('does not treat order notes as product reviews or invent guest accounts', () => {
    const s = source(); s.tables.comments.push({ comment_ID: '1', comment_type: 'order_note' }, { comment_ID: '2', comment_type: 'review', user_id: '0' });
    expect(buildPlan(s, target()).summary.reviews).toEqual({ total: 1, missing: 0, existing: 0, blocked: 1 });
  });
  it('blocks an existing order number collision instead of updating it', () => {
    const s = source(); s.tables.posts.push({ ID: '10', post_type: 'shop_order' });
    const t = target(); t.orders.push({ id: '10' });
    expect(buildPlan(s, t).summary.orders.blocked).toBe(1);
    expect(buildPlan(s, t).groups.some(g => g.type === 'orders')).toBe(false);
  });
});

function orderFixture() {
  const s = source(), t = target();
  s.tables.posts.push({ ID: '10', post_type: 'shop_order', post_status: 'wc-delivered', post_date_gmt: '2020-01-01 00:00:00', post_modified_gmt: '2020-01-02 00:00:00' }, { ID: '5', post_type: 'product' });
  const meta = { _customer_user: '1', _payment_method: 'cod', _order_currency: 'INR', _order_total: '100', _order_shipping: '0', _order_tax: '0', _cart_discount: '0', _billing_address_1: 'Fixture address', _billing_country: 'IN', _billing_postcode: '700001' };
  s.tables.postmeta.push(...Object.entries(meta).map(([meta_key, meta_value]) => ({ post_id: '10', meta_key, meta_value })), { post_id: '5', meta_key: '_sku', meta_value: 'SKU-1' });
  s.tables.woocommerce_order_items.push({ order_item_id: '20', order_id: '10', order_item_type: 'line_item', order_item_name: 'Fixture product' });
  s.tables.woocommerce_order_itemmeta.push(...Object.entries({ _product_id: '5', _qty: '2', _line_subtotal: '100', _line_total: '100', _line_tax: '0' }).map(([meta_key, meta_value]) => ({ order_item_id: '20', meta_key, meta_value })));
  t.products.push({ _id: '123456789012345678901234', sku: 'SKU-1' });
  return { s, t };
}
describe('historical order validation', () => {
  it('plans complete orders and preserves totals, dates, snapshots and stock state', () => {
    const { s, t } = orderFixture(), p = buildPlan(s, t);
    expect(p.summary.orders.missing).toBe(1);
    const group = p.groups.find(g => g.type === 'orders');
    expect(group.docs).toHaveLength(2);
    expect(group.docs[0].doc).toMatchObject({ id: '10', grand_total: 100, stock_reserved: false, payment_status: 'paid', is_migrated: true });
    expect(group.docs[0].doc.billing_address_snapshot.address_line_1).toBe('Fixture address');
    expect(group.docs[1].doc.order_id).toBe(group.docs[0].doc._id);
  });
  it('does not import incomplete orders, mismatched totals, refunds or unknown statuses', () => {
    for (const mutate of [
      ({t}) => { t.products = []; },
      ({s}) => { s.tables.postmeta.find(m => m.meta_key === '_order_total').meta_value = '200'; },
      ({s}) => { s.tables.posts.push({ ID: '11', post_type: 'shop_order_refund', post_parent: '10' }); },
      ({s}) => { s.tables.posts[0].post_status = 'wc-unknown'; },
    ]) {
      const fixture = orderFixture(); mutate(fixture);
      const plan = buildPlan(fixture.s, fixture.t);
      expect(plan.summary.orders.blocked).toBe(1);
      expect(plan.groups.some(g => g.type === 'orders')).toBe(false);
    }
  });
  it('retains guest orders without inventing a customer association', () => {
    const {s,t} = orderFixture(); s.tables.postmeta.find(m => m.meta_key === '_customer_user').meta_value = '0';
    expect(buildPlan(s,t).groups.find(g => g.type === 'orders').docs[0].doc.user).toBeNull();
  });
  it('does not duplicate previously migrated orders', () => {
    const {s,t} = orderFixture(), first = buildPlan(s,t);
    t.orders.push(first.groups.find(g => g.type === 'orders').docs[0].doc);
    expect(buildPlan(s,t).summary.orders.existing).toBe(1);
  });
});
