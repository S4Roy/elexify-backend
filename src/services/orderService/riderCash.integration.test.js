import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../notification/sendOrderNotification.js', () => ({ sendOrderNotification: vi.fn() }));
import { dispatchManual, markManualDelivered } from './packages/manualFulfillment.js';
import { cashInHand, pendingRiderCash, receiveRiderCash, riderCashSummary } from './riderCash.js';
import CashHandover from '../../models/CashHandover.js';
import Order from '../../models/Order.js';
import OrderItem from '../../models/OrderItem.js';
import Package from '../../models/Package.js';
import Role from '../../models/Role.js';
import User from '../../models/User.js';

// Same dedicated replica-set database as the return workflow suite.
const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const admin = new mongoose.Types.ObjectId();
let rider;

const deliverCod = async (id, total, method) => {
  const order = await Order.create({ id, user: new mongoose.Types.ObjectId(), total_amount: total, grand_total: total,
    order_status: 'processing', payment_status: 'pending', payment_method: 'cod', created_at: new Date(Date.now() - 86_400_000) });
  await OrderItem.create({ order_id: order._id, product_id: new mongoose.Types.ObjectId(), product_name: 'Item', sku: 'S',
    quantity: 1, unit_price: total, total_price: total, final_line_total: total });
  const { pkg } = await dispatchManual({ orderId: String(order._id), mode: 'self_delivery', agent: { user_id: String(rider._id) },
    reason: 'Local run', adminId: admin, dispatchedAt: new Date(Date.now() - 3_600_000) });
  await markManualDelivered({ packageId: String(pkg._id), deliveredAt: new Date(), receiverName: 'Customer',
    codCollection: { amount: total, method, reference: method === 'upi' ? 'UPI1' : null }, adminId: rider._id, riderId: rider._id });
  return order;
};

suite('rider COD cash handover with real MongoDB', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    await Promise.all([Order.createIndexes(), Package.createIndexes(), CashHandover.createIndexes()]);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const name of ['orders', 'order_items', 'packages', 'roles', 'users', 'cash_handovers']) await mongoose.connection.db.collection(name).deleteMany({});
    const role = await Role.create({ name: 'Delivery Staff', key: 'test-delivery', permissions: ['delivery.run'], status: 'active' });
    rider = await User.create({ name: 'Ravi', role: 'staff', mobile: '9876500001', admin_role_id: role._id });
  });

  it('tracks cash with the rider, records a short handover, and clears it', async () => {
    const a = await deliverCod('ORD-A', 500, 'cash');
    const b = await deliverCod('ORD-B', 300, 'cash');
    await deliverCod('ORD-C', 200, 'upi'); // paid straight to the business

    expect(await cashInHand(rider._id)).toEqual({ amount: 800, order_count: 2 });
    const summary = await riderCashSummary();
    expect(summary).toMatchObject({ total_pending: 800, riders: [{ rider_name: 'Ravi', order_count: 2, amount: 800 }] });
    expect(String(summary.riders[0].rider_user_id)).toBe(String(rider._id));
    expect((await pendingRiderCash({ riderUserId: rider._id })).map((o) => o.id)).toEqual(['ORD-A', 'ORD-B']);

    const handover = await receiveRiderCash({ riderUserId: String(rider._id), orderIds: [String(a._id), String(b._id)],
      amountReceived: 750, note: 'Short 50', adminId: admin });
    expect(handover).toMatchObject({ rider_name: 'Ravi', order_count: 2, amount_expected: 800, amount_received: 750, discrepancy: -50 });
    expect((await Order.findById(a._id)).cod_collection.handover).toMatchObject({ status: 'received' });
    expect(await cashInHand(rider._id)).toEqual({ amount: 0, order_count: 0 });
    expect((await riderCashSummary()).recent_handovers).toHaveLength(1);

    await expect(receiveRiderCash({ riderUserId: String(rider._id), orderIds: [String(a._id)], amountReceived: 500, adminId: admin }))
      .rejects.toThrow(/no longer pending/);
    expect(await CashHandover.countDocuments()).toBe(1);
  });
});
