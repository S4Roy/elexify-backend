import { createHash } from 'node:crypto';
import { normalizeOrderStatus } from '../../helpers/order/normalizeOrderStatus.js';

export const sourceId = (kind, id) => createHash('sha256').update(`eqstoxco_wp434:${kind}:${id}`).digest('hex').slice(0, 24);
const email = value => String(value || '').trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const money = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : NaN;
const date = value => { const d = new Date(String(value || '').replace(' ', 'T') + 'Z'); return Number.isFinite(+d) ? d : null; };
function index(rows, key) {
  const result = new Map();
  for (const row of rows) { const k = String(key(row)); result.set(k, [...(result.get(k) || []), row]); }
  return result;
}
function metadata(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = row[key]; if (!result.has(id)) result.set(id, {});
    // Duplicate metadata is ambiguous; never silently select one value.
    const value = result.get(id);
    if (Object.hasOwn(value, row.meta_key)) value.__ambiguous = true;
    value[row.meta_key] = Object.hasOwn(value, row.meta_key) ? null : row.meta_value;
  }
  return result;
}

export function buildPlan(source, target) {
  const t = source.tables;
  const pm = metadata(t.postmeta, 'post_id'), um = metadata(t.usermeta, 'user_id');
  const im = metadata(t.woocommerce_order_itemmeta, 'order_item_id'), cm = metadata(t.commentmeta, 'comment_id');
  const usersByEmail = index(target.users, u => email(u.email));
  const usersById = new Map(target.users.map(u => [String(u._id), u]));
  const sourceEmails = index(t.users, u => email(u.user_email));
  const productsBySku = index(target.products.filter(p => !p.deleted_at), p => p.sku);
  const variationsBySku = index(target.variations.filter(p => !p.deleted_at), p => p.sku);
  const posts = new Map(t.posts.map(p => [p.ID, p]));
  const ordersById = index(target.orders, o => o.id);
  const transactions = index(target.orders.filter(o => o.transaction_id), o => o.transaction_id);
  const itemsByOrder = index(t.woocommerce_order_items, i => i.order_id);
  const refunds = new Set(t.posts.filter(p => p.post_type === 'shop_order_refund').map(p => p.post_parent));
  const plan = { groups: [], summary: {}, issues: [], issueCounts: {} };
  const userMap = new Map();
  for (const type of ['customers', 'orders', 'reviews']) plan.summary[type] = { total: 0, missing: 0, existing: 0, blocked: 0 };
  const block = (type, id, reason) => {
    plan.summary[type].blocked++;
    plan.issueCounts[reason] = (plan.issueCounts[reason] || 0) + 1;
    if (plan.issues.length < 100) plan.issues.push({ type, sourceId: id, reason });
  };
  const add = (type, docs) => { plan.summary[type].missing++; plan.groups.push({ type, docs }); };
  for (const u of t.users) {
    const roles = um.get(u.ID)?.wpgh_capabilities || '';
    // Never import WordPress admin/staff privileges as customer accounts.
    if (!/s:8:"customer";b:1/.test(roles) || /s:\d+:"(?:administrator|editor|shop_manager|author)";b:1/.test(roles)) continue;
    plan.summary.customers.total++;
    if (um.get(u.ID)?.__ambiguous) { block('customers', u.ID, 'Duplicate customer metadata'); continue; }
    const e = email(u.user_email), matches = usersByEmail.get(e) || [];
    if (!validEmail(e) || sourceEmails.get(e)?.length !== 1 || matches.length > 1) { block('customers', u.ID, 'Ambiguous or missing customer email'); continue; }
    const imported = usersById.get(sourceId('customer', u.ID));
    if (imported && (email(imported.email) !== e || imported.deleted_at)) { block('customers', u.ID, 'Previously imported customer has changed'); continue; }
    if (matches.length) {
      if (matches[0].deleted_at || !['customer', 'user'].includes(matches[0].role)) { block('customers', u.ID, 'Email belongs to a deleted or staff account'); continue; }
      userMap.set(u.ID, String(matches[0]._id)); plan.summary.customers.existing++; continue;
    }
    const created = date(u.user_registered);
    if (!created || !u.display_name?.trim()) { block('customers', u.ID, 'Missing customer name or registration date'); continue; }
    const doc = { _id: sourceId('customer', u.ID), name: u.display_name, email: e, role: 'customer', status: 'active', created_at: created, legacy_import: { source: 'eqstoxco_wp434', id: u.ID, addresses: Object.fromEntries(Object.entries(um.get(u.ID) || {}).filter(([key]) => key.startsWith('billing_') || key.startsWith('shipping_'))) } };
    userMap.set(u.ID, doc._id);
    add('customers', [{ model: 'User', doc }]);
  }
  const productMatch = (productId, variationId = '0') => {
    const isVariation = variationId && variationId !== '0';
    const productMeta = pm.get(isVariation ? variationId : productId);
    if (productMeta?.__ambiguous) return null;
    const sku = productMeta?._sku;
    if (!sku) return null;
    const matches = (isVariation ? variationsBySku : productsBySku).get(sku) || [];
    if (matches.length !== 1) return null;
    const matched = matches[0];
    if (isVariation) {
      const parentSku = pm.get(productId)?._sku;
      const parent = target.products.find(p => String(p._id) === String(matched.product_id) && !p.deleted_at);
      if (!parent || (parentSku && parent.sku !== parentSku)) return null;
    }
    return { product_id: isVariation ? matched.product_id : matched._id, variation_id: isVariation ? matched._id : null, sku };
  };
  const snapshot = (m, kind) => {
    const get = field => m[`_${kind}_${field}`] || '';
    if (!get('address_1') || !get('country') || !get('postcode')) return null;
    return { full_name: `${get('first_name')} ${get('last_name')}`.trim(), address_line_1: get('address_1'), address_line_2: get('address_2'), city_name: get('city'), state_name: get('state'), country_name: get('country'), postcode: get('postcode'), phone: m._billing_phone || '', email: m._billing_email || '' };
  };
  for (const p of t.posts.filter(p => p.post_type === 'shop_order')) {
    plan.summary.orders.total++;
    const m = pm.get(p.ID) || {};
    if (m.__ambiguous) { block('orders', p.ID, 'Duplicate order metadata'); continue; }
    const existing = ordersById.get(p.ID) || [];
    if (existing.length) {
      if (existing.length === 1 && existing[0].is_migrated && !existing[0].deleted_at && existing[0].grand_total === money(m._order_total) && existing[0].currency === m._order_currency) plan.summary.orders.existing++;
      else block('orders', p.ID, 'Order number already exists; manual reconciliation required');
      continue;
    }
    if (m._transaction_id && transactions.has(m._transaction_id)) { block('orders', p.ID, 'Payment reference already exists'); continue; }
    const status = normalizeOrderStatus(p.post_status.replace(/^wc-/, ''));
    const created = date(p.post_date_gmt);
    if (!status || !created) { block('orders', p.ID, 'Unsupported order status or date'); continue; }
    if (refunds.has(p.ID) || p.post_status === 'wc-refunded') { block('orders', p.ID, 'Refund requires manual reconciliation'); continue; }
    if (!['cod', 'razorpay'].includes(m._payment_method)) { block('orders', p.ID, 'Unsupported payment method'); continue; }
    if (m._order_currency !== 'INR') { block('orders', p.ID, 'Currency requires a verified historical exchange rate'); continue; }
    const customer = m._customer_user;
    if (customer === undefined || customer === null || !/^\d+$/.test(customer)) { block('orders', p.ID, 'Missing customer reference'); continue; }
    if (customer && customer !== '0' && !userMap.has(customer)) { block('orders', p.ID, 'Customer could not be matched'); continue; }
    const grand = money(m._order_total), shipping = money(m._order_shipping ?? '0'), tax = money(m._order_tax ?? '0'), shippingTax = money(m._order_shipping_tax ?? '0');
    const discount = money(m._cart_discount ?? '0');
    const sourceItems = itemsByOrder.get(p.ID) || [];
    if (sourceItems.some(i => !['line_item', 'shipping', 'coupon', 'tax'].includes(i.order_item_type))) { block('orders', p.ID, 'Order contains unsupported fees or item types'); continue; }
    const lines = sourceItems.filter(i => i.order_item_type === 'line_item');
    const items = []; let issue = null;
    for (const line of lines) {
      const v = im.get(line.order_item_id) || {};
      if (v.__ambiguous) { issue = 'Duplicate order item metadata'; break; }
      const match = productMatch(v._product_id, v._variation_id);
      const qty = money(v._qty), subtotal = money(v._line_subtotal), total = money(v._line_total), lineTax = money(v._line_tax ?? '0');
      if (!match) { issue = 'Missing or ambiguous product SKU'; break; }
      if (!Number.isInteger(qty) || qty <= 0 || ![subtotal, total, lineTax].every(Number.isFinite) || total > subtotal) { issue = 'Invalid order item amounts'; break; }
      items.push({ model: 'OrderItem', doc: { _id: sourceId('item', line.order_item_id), order_id: sourceId('order', p.ID), ...match, product_name: line.order_item_name, quantity: qty, unit_price: subtotal / qty, total_price: total, base_unit_price: subtotal / qty, base_line_total: subtotal, coupon_discount: subtotal - total, taxable_amount: total, tax_amount: lineTax, final_line_total: total + lineTax, currency: m._order_currency, createdAt: created, updatedAt: created } });
    }
    if (issue || !items.length) { block('orders', p.ID, issue || 'Order has no line items'); continue; }
    const sum = field => items.reduce((n, i) => n + i.doc[field], 0);
    if (![grand, shipping, tax, shippingTax, discount].every(Number.isFinite) || Math.abs(sum('total_price') + tax + shipping + shippingTax - grand) > 0.02 || Math.abs(sum('tax_amount') - tax) > 0.02 || Math.abs(sum('base_line_total') - sum('total_price') - discount) > 0.02) { block('orders', p.ID, 'Order totals do not reconcile'); continue; }
    const billing = snapshot(m, 'billing'), shippingAddress = snapshot(m, 'shipping') || billing;
    if (!billing) { block('orders', p.ID, 'Incomplete billing address'); continue; }
    const paidAt = /^\d+$/.test(m._date_paid || '') ? new Date(Number(m._date_paid) * 1000) : date(m._paid_date);
    if (paidAt && !Number.isFinite(+paidAt)) { block('orders', p.ID, 'Invalid payment date'); continue; }
    if (m._payment_method !== 'cod' && !paidAt && !['pending', 'failed', 'cancelled'].includes(status)) { block('orders', p.ID, 'Payment state cannot be established'); continue; }
    const doc = { _id: sourceId('order', p.ID), id: p.ID, user: userMap.get(customer) || null, order_status: status, payment_status: paidAt || (m._payment_method === 'cod' && status === 'delivered') ? 'paid' : status === 'failed' ? 'failed' : 'pending', payment_method: m._payment_method, transaction_id: m._transaction_id || undefined, paid_at: paidAt, total_amount: sum('base_line_total'), total_items: items.length, discount, shipping: shipping + shippingTax, grand_total: grand, currency: m._order_currency, billing_address_snapshot: billing, shipping_address_snapshot: shippingAddress, is_migrated: true, stock_reserved: false, created_at: created, updated_at: date(p.post_modified_gmt), legacy_import: { source: 'eqstoxco_wp434', id: p.ID, status: p.post_status, tax, shipping_tax: shippingTax } };
    add('orders', [{ model: 'Order', doc }, ...items]);
  }
  const reviewKeys = new Set(target.reviews.map(r => `${r.user}:${r.product_id}:${r.variation_id || ''}`));
  const plannedReviewKeys = new Set();
  for (const r of t.comments.filter(r => r.comment_type === 'review' || (r.comment_type === 'comment' && cm.get(r.comment_ID)?.rating))) {
    plan.summary.reviews.total++;
    const v = cm.get(r.comment_ID) || {}, rating = Number(v.rating);
    if (v.__ambiguous) { block('reviews', r.comment_ID, 'Duplicate review metadata'); continue; }
    const product = productMatch(r.comment_post_ID), user = userMap.get(r.user_id);
    if (!user) { block('reviews', r.comment_ID, 'Guest or unmatched review author'); continue; }
    if (!product || posts.get(r.comment_post_ID)?.post_type !== 'product') { block('reviews', r.comment_ID, 'Missing or ambiguous review product'); continue; }
    const key = `${user}:${product.product_id}:`;
    if (reviewKeys.has(key)) { plan.summary.reviews.existing++; continue; }
    const created = date(r.comment_date_gmt);
    if (!created || !Number.isInteger(rating) || rating < 1 || rating > 5 || r.comment_content.length > 2000 || !['0', '1'].includes(r.comment_approved)) { block('reviews', r.comment_ID, 'Invalid review rating, date, length or moderation status'); continue; }
    if (plannedReviewKeys.has(key)) { block('reviews', r.comment_ID, 'Multiple source reviews for the same customer and product'); continue; }
    plannedReviewKeys.add(key);
    add('reviews', [{ model: 'Rating', doc: { _id: sourceId('review', r.comment_ID), legacy_import: { source: 'eqstoxco_wp434', id: r.comment_ID }, user, product_id: product.product_id, rating, description: r.comment_content, status: r.comment_approved === '1' ? 'approved' : 'pending', created_at: created, updated_at: created } }]);
  }
  plan.fingerprint = createHash('sha256').update(source.fingerprint).update(JSON.stringify(plan)).digest('hex');
  return plan;
}
