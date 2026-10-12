import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../notification/sendNotification.js', () => ({
  sendNotification: vi.fn(async () => ({ success: true, results: [{ channel: 'email', queued: true }] })),
}));
vi.mock('../email/index.js', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('../audit/recordAudit.js', () => ({ recordAudit: vi.fn() }));
import { sendNotification } from '../notification/sendNotification.js';
import { sendEmail } from '../email/index.js';
import { runBackInStockCycle, runLowStockCycle, subscribe } from './index.js';
import { lowStock, requests, updateSettings } from '../../controllers/admin/stockAlerts.js';
import StockAlertSubscription from '../../models/StockAlertSubscription.js';
import StockAlertSettings from '../../models/StockAlertSettings.js';
import LowStockAlert from '../../models/LowStockAlert.js';
import EmailTemplate from '../../models/EmailTemplate.js';

// Same dedicated replica-set database convention as the other suites.
const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const db = () => mongoose.connection.db;
const product = async (fields) => (await db().collection('products').insertOne({
  type: 'simple', status: 'active', deleted_at: null, images: [], sku: null, ...fields,
})).insertedId;
const setStock = (collection, _id, stock_quantity) => db().collection(collection).updateOne({ _id }, { $set: { stock_quantity } });
const call = async (handler, req = {}) => {
  let body; let error;
  const res = { status: () => res, json: (b) => { body = b; return res; } };
  await handler({ query: {}, body: {}, headers: {}, auth: { user_id: new mongoose.Types.ObjectId() }, ...req }, res, (e) => { error = e; });
  if (error) throw error;
  return body.data;
};

suite('stock alerts with real MongoDB', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    await Promise.all([StockAlertSubscription.createIndexes(), LowStockAlert.createIndexes()]);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const name of ['products', 'product_variations', 'stock_alert_subscriptions', 'stock_alert_settings', 'low_stock_alerts', 'site_settings', 'email_templates']) {
      await db().collection(name).deleteMany({});
    }
    vi.mocked(sendNotification).mockClear();
    vi.mocked(sendEmail).mockClear();
  });

  it('notifies each waiting customer once when the product is restocked', async () => {
    const mouse = await product({ name: 'Wireless Mouse', slug: 'wireless-mouse', stock_quantity: 0 });
    const [a, b] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    expect((await subscribe({ userId: a, productId: mouse })).subscription).toBeTruthy();
    await subscribe({ userId: a, productId: mouse }); // repeat tap is idempotent
    await subscribe({ userId: b, productId: mouse, source: 'app' });
    expect(await StockAlertSubscription.countDocuments({ status: 'active' })).toBe(2);

    expect((await runBackInStockCycle()).notified).toBe(0);
    await setStock('products', mouse, 4);
    expect((await runBackInStockCycle()).notified).toBe(2);
    const call0 = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call0).toMatchObject({ event: 'BACK_IN_STOCK', data: { product_name: 'Wireless Mouse', product_slug: 'wireless-mouse' } });
    expect(call0.data.product_url).toMatch(/\/products\/wireless-mouse$/);
    expect((await runBackInStockCycle()).notified).toBe(0);
    expect(await StockAlertSubscription.countDocuments({ status: 'notified', channels: 'email' })).toBe(2);

    // Can't ask to be notified about something that's in stock.
    expect((await subscribe({ userId: a, productId: mouse })).error).toBe('in_stock');
  });

  it('requires the sold-out variation for variable products', async () => {
    const phone = await product({ name: 'Phone', slug: 'phone', type: 'variable', stock_quantity: 0 });
    const { insertedId: blue } = await db().collection('product_variations').insertOne({
      product_id: phone, combination_display: 'Blue / 128GB', status: 'active', stock_quantity: 0, deleted_at: null, images: [],
    });
    expect((await subscribe({ userId: new mongoose.Types.ObjectId(), productId: phone })).error).toBe('variation_required');
    await subscribe({ userId: new mongoose.Types.ObjectId(), productId: phone, variationId: blue });
    await setStock('product_variations', blue, 3);
    expect((await runBackInStockCycle()).notified).toBe(1);
    expect(vi.mocked(sendNotification).mock.calls[0][0].data).toMatchObject({ variation_name: 'Blue / 128GB' });
    expect(vi.mocked(sendNotification).mock.calls[0][0].data.product_url).toContain(`variation_id=${blue}`);
  });

  it('emails admins only about new low/out-of-stock items, and again after a restock', async () => {
    const out = await product({ name: 'Keyboard', slug: 'keyboard', stock_quantity: 0, sku: 'KB-1' });
    const low = await product({ name: 'Cable', slug: 'cable', stock_quantity: 2 });
    await product({ name: 'Charger', slug: 'charger', stock_quantity: 50 });
    await StockAlertSubscription.create({ user_id: new mongoose.Types.ObjectId(), product_id: out });

    expect((await runLowStockCycle()).alerted).toBe(0); // off by default
    await expect(call(updateSettings, { body: { low_stock_alerts_enabled: true } })).rejects.toThrow(/recipient/);
    await call(updateSettings, { body: { low_stock_alerts_enabled: true, low_stock_recipients: 'ops@example.com, Store@Example.com', low_stock_threshold: 5 } });
    expect((await StockAlertSettings.findOne().lean()).low_stock_recipients).toEqual(['ops@example.com', 'store@example.com']);

    expect((await runLowStockCycle()).alerted).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [to, template, , , data] = vi.mocked(sendEmail).mock.calls[0];
    expect([to, template]).toEqual(['ops@example.com', 'low_stock_alert']);
    expect(data).toMatchObject({ threshold: 5, out_count: 1, low_count: 1 });
    expect(data.stock_items[0]).toMatchObject({ product_name: 'Keyboard', stock_quantity: 0, waiting: 1 });
    expect(await EmailTemplate.countDocuments({ action: 'low_stock_alert' })).toBe(1);

    vi.mocked(sendEmail).mockClear();
    expect((await runLowStockCycle()).alerted).toBe(0);
    await setStock('products', low, 0); // low → out alerts again
    expect((await runLowStockCycle()).alerted).toBe(1);
    await setStock('products', out, 20); // restocked → resolved
    expect((await runLowStockCycle()).resolved).toBe(1);
    await setStock('products', out, 1); // drops again → new alert
    expect((await runLowStockCycle()).alerted).toBe(1);

    const page = await call(lowStock, { query: { level: 'out' } });
    expect(page.threshold).toBe(5);
    expect(page.docs.map((d) => d.name)).toEqual(['Cable']);
    const demand = await call(requests);
    expect(demand.docs[0]).toMatchObject({ name: 'Keyboard', waiting: 1, stock_quantity: 1 });
    expect(demand.totals.waiting).toBe(1);
  });
});
