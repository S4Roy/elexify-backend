import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../notification/sendNotification.js', () => ({
  sendNotification: vi.fn(async () => ({ success: true, results: [{ channel: 'email', queued: true }] })),
}));
vi.mock('../audit/recordAudit.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../notification/push/config.js', () => ({ pushConfig: vi.fn(async () => ({ enabled: false })) }));
import { sendNotification } from '../notification/sendNotification.js';
import { runAbandonedCartCycle } from './index.js';
import { list, stats, remind } from '../../controllers/admin/abandonedCart.js';
import AbandonedCart from '../../models/AbandonedCart.js';
import AbandonedCartSettings from '../../models/AbandonedCartSettings.js';
import Cart from '../../models/Cart.js';
import NotificationPreference from '../../models/NotificationPreference.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';

// Same dedicated replica-set database convention as the other suites.
const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const HOUR = 3_600_000;
let productId;

const customer = async ({ optedIn = true } = {}) => {
  const user = await User.create({ name: 'Asha', role: 'user', email: `asha${Date.now()}${Math.random()}@example.com`, email_verified_at: new Date() });
  await NotificationPreference.create({ user_id: user._id, reminders: { abandoned_cart_email: optedIn } });
  return user;
};
const cartRow = async (user, idleMs) => {
  const row = await Cart.create({ user: user._id, product: productId, quantity: 2, price: 500 });
  await Cart.collection.updateOne({ _id: row._id }, { $set: { updatedAt: new Date(Date.now() - idleMs) } });
  return row;
};

suite('abandoned cart cycle with real MongoDB', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    await AbandonedCart.createIndexes();
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const name of ['abandoned_carts', 'abandoned_cart_settings', 'carts', 'orders', 'users', 'notification_preferences', 'products']) {
      await mongoose.connection.db.collection(name).deleteMany({});
    }
    ({ insertedId: productId } = await mongoose.connection.db.collection('products').insertOne({ name: 'Wireless Mouse', images: [] }));
    await AbandonedCartSettings.create({ auto_reminders_enabled: true });
    vi.mocked(sendNotification).mockClear();
  });

  it('detects an idle cart, sends the first reminder once, then marks the order as recovered', async () => {
    const user = await customer();
    await cartRow(user, 2 * HOUR);

    const first = await runAbandonedCartCycle();
    expect(first).toMatchObject({ opened: 1, reminded: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.event).toBe('ABANDONED_CART');
    expect(call.data).toMatchObject({ item_count: 2, cart_total: 1000, items: [{ product_name: 'Wireless Mouse', quantity: 2, total_price: 1000 }] });

    const second = await runAbandonedCartCycle();
    expect(second.reminded).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    await Order.create({ id: 'ORD-AC-1', user: user._id, total_amount: 1000, grand_total: 1000,
      order_status: 'processing', payment_status: 'pending', payment_method: 'cod', created_at: new Date() });
    const third = await runAbandonedCartCycle();
    expect(third.recovered).toBe(1);
    const episode = await AbandonedCart.findOne({ user_id: user._id }).lean();
    expect(episode).toMatchObject({ status: 'recovered', recovered_order_number: 'ORD-AC-1', recovered_value: 1000, recovered_via_reminder: true });
    expect(episode.reminders).toHaveLength(1);
    expect(episode.reminders[0]).toMatchObject({ kind: 'auto', step: 1, channels: ['email'] });

    // The same idle cart (e.g. after a "Buy now" order) must not reopen.
    expect((await runAbandonedCartCycle()).opened).toBe(0);
  });

  it('never messages a customer who has not opted in, and ignores carts still in use', async () => {
    const user = await customer({ optedIn: false });
    await cartRow(user, 2 * HOUR);
    const active = await customer();
    await cartRow(active, 5 * 60_000);

    const result = await runAbandonedCartCycle();
    expect(result.opened).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
    const episode = await AbandonedCart.findOne({ user_id: user._id }).lean();
    expect(episode.auto_steps_sent).toBe(1);
    expect(episode.reminders[0].channels).toEqual([]);
    expect(await AbandonedCart.countDocuments({ user_id: active._id })).toBe(0);
  });

  it('expires an open cart once the customer empties it, and sends nothing while automation is off', async () => {
    await AbandonedCartSettings.updateOne({}, { $set: { auto_reminders_enabled: false } });
    const user = await customer();
    const row = await cartRow(user, 2 * HOUR);
    expect((await runAbandonedCartCycle()).opened).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();

    await Cart.updateOne({ _id: row._id }, { $set: { deleted_at: new Date() } });
    expect((await runAbandonedCartCycle()).expired).toBe(1);
    expect(await AbandonedCart.findOne({ user_id: user._id }).lean()).toMatchObject({ status: 'expired', closed_reason: 'cart_emptied' });
  });

  it('serves the admin list, stats and manual reminder', async () => {
    await AbandonedCartSettings.updateOne({}, { $set: { auto_reminders_enabled: false } });
    const user = await customer();
    await cartRow(user, 2 * HOUR);
    await runAbandonedCartCycle();
    const call = async (handler, req) => {
      let body; let error;
      const res = { status: () => res, json: (b) => { body = b; return res; } };
      await handler({ query: {}, body: {}, auth: { user_id: new mongoose.Types.ObjectId() }, headers: {}, ...req }, res, (e) => { error = e; });
      if (error) throw error;
      return body.data;
    };

    const page = await call(list, { query: { status: 'open', search: 'mouse' } });
    expect(page.docs).toHaveLength(1);
    expect(page.docs[0]).toMatchObject({ cart_value: 1000, item_count: 2, reachable: { email: true, whatsapp: false, push: false } });
    expect(page.docs[0].customer.name).toBe('Asha');

    const sent = await call(remind, { body: { ids: [String(page.docs[0]._id)], coupon_code: 'back10' } });
    expect(sent.sent).toEqual([{ id: String(page.docs[0]._id), channels: ['email'] }]);
    expect(vi.mocked(sendNotification).mock.calls[0][0].data.coupon_code).toBe('BACK10');
    const again = await call(remind, { body: { ids: [String(page.docs[0]._id)] } });
    expect(again.skipped[0].reason).toMatch(/less than an hour/);

    const kpis = await call(stats, {});
    expect(kpis).toMatchObject({ total: 1, open: 1, open_value: 1000, reminded: 1, reminders_sent: 1, recovery_rate: 0 });
  });
});
