import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../../notification/sendOrderNotification.js', () => ({ sendOrderNotification: vi.fn() }));
import { dispatchManual, markManualDelivered, returnToStore } from './manualFulfillment.js';
import { returnEligibility } from '../../returnService/rules.js';
import Order from '../../../models/Order.js';
import OrderItem from '../../../models/OrderItem.js';
import Package from '../../../models/Package.js';
import ShippingSettings from '../../../models/ShippingSettings.js';

// Same dedicated replica-set database as the return workflow suite.
const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const admin = new mongoose.Types.ObjectId();
let order;

suite('manual fulfillment with real MongoDB transactions', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    await Promise.all([Order.createIndexes(), Package.createIndexes()]);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const name of ['orders', 'order_items', 'packages', 'shipping_settings']) await mongoose.connection.db.collection(name).deleteMany({});
    await ShippingSettings.create({ returns_enabled: true, return_window_days: 7 });
    order = await Order.create({ id: `ORDER-${new mongoose.Types.ObjectId()}`, user: new mongoose.Types.ObjectId(), total_amount: 300, grand_total: 320,
      order_status: 'processing', payment_status: 'pending', payment_method: 'cod', stock_reserved: true, created_at: new Date(Date.now() - 86_400_000) });
    await OrderItem.create({ order_id: order._id, product_id: new mongoose.Types.ObjectId(), product_name: 'Item', sku: 'SKU', quantity: 2,
      unit_price: 150, total_price: 300, final_line_total: 320 });
  });

  it('dispatches by rider, records COD cash, and starts the return window at the handover time', async () => {
    // Recorded after the fact: rider left 2h ago, handed over 1h ago.
    const { pkg } = await dispatchManual({ orderId: String(order._id), mode: 'self_delivery', agent: { name: 'Ravi' }, reason: 'Local delivery',
      adminId: admin, dispatchedAt: new Date(Date.now() - 7_200_000) });
    expect((await Order.findById(order._id)).order_status).toBe('out_for_delivery');

    const handover = new Date(Date.now() - 3_600_000);
    await markManualDelivered({ packageId: String(pkg._id), deliveredAt: handover, receiverName: 'Asha',
      codCollection: { amount: 320, method: 'cash' }, adminId: admin });

    const delivered = await Order.findById(order._id);
    expect(delivered).toMatchObject({ order_status: 'delivered', payment_status: 'paid' });
    expect(delivered.delivered_at.getTime()).toBe(handover.getTime());
    expect(delivered.cod_collection).toMatchObject({ amount: 320, method: 'cash', collected_by: 'Ravi' });
    expect((await Package.findById(pkg._id)).proof_of_delivery.receiver_name).toBe('Asha');
    const eligibility = returnEligibility(delivered, { returns_enabled: true, return_window_days: 7 }, [], []);
    expect(eligibility.deadline.getTime()).toBe(handover.getTime() + 7 * 86400000);
  });

  it('rolls a returned pickup back to processing so it can be re-dispatched', async () => {
    const { pkg } = await dispatchManual({ orderId: String(order._id), mode: 'store_pickup', agent: { name: 'Counter' }, reason: 'Pickup requested', adminId: admin });
    expect((await Order.findById(order._id)).order_status).toBe('packed');
    await returnToStore({ packageId: String(pkg._id), reason: 'Never collected', adminId: admin });
    expect(await Order.findById(order._id)).toMatchObject({ order_status: 'processing', package_count: 0 });
    await dispatchManual({ orderId: String(order._id), mode: 'self_delivery', agent: { name: 'Ravi' }, reason: 'Deliver instead', adminId: admin });
    expect((await Order.findById(order._id)).order_status).toBe('out_for_delivery');
  });
});
