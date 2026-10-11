import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { codRemittanceSummary, importCodRemittance } from './codRemittance.js';
import { recomputeOrderStatus } from './packages/recomputeOrderStatus.js';
import Order from '../../models/Order.js';
import OrderItem from '../../models/OrderItem.js';
import Package from '../../models/Package.js';

// Same dedicated replica-set database as the return workflow suite.
const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const days = (n) => new Date(Date.now() - n * 86400000);

const deliveredCodOrder = async (id, awb, deliveredDaysAgo) => {
  const order = await Order.create({ id, user: new mongoose.Types.ObjectId(), total_amount: 500, grand_total: 500,
    order_status: 'out_for_delivery', payment_status: 'pending', payment_method: 'cod' });
  const item = await OrderItem.create({ order_id: order._id, product_id: new mongoose.Types.ObjectId(), product_name: 'Item', sku: 'S',
    quantity: 1, unit_price: 500, total_price: 500, final_line_total: 500 });
  await Package.create({ order_id: order._id, package_number: 1, reference_id: `${id}-P1`, status: 'delivered', awb,
    items: [{ order_item_id: item._id, quantity: 1 }], integration_status: 'created' });
  await Order.updateOne({ _id: order._id }, { $set: { delivered_at: days(deliveredDaysAgo) } });
  await recomputeOrderStatus({ orderId: order._id, source: 'carrier' });
  return Order.findById(order._id);
};

suite('COD remittance with real MongoDB', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    await Promise.all([Order.createIndexes(), Package.createIndexes()]);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const name of ['orders', 'order_items', 'packages']) await mongoose.connection.db.collection(name).deleteMany({});
  });

  it('marks courier COD paid on delivery, reports what is owed, and settles on import', async () => {
    const fresh = await deliveredCodOrder('ORD-A', 'AWB-A', 2);
    await deliveredCodOrder('ORD-B', 'AWB-B', 15);
    expect(fresh).toMatchObject({ order_status: 'delivered', payment_status: 'paid' });
    expect(fresh.cod_remittance).toMatchObject({ status: 'awaiting', expected_amount: 500 });

    let summary = await codRemittanceSummary({ overdueDays: 10 });
    expect(summary).toMatchObject({ awaiting_count: 2, awaiting_amount: 1000, overdue_count: 1, overdue_amount: 500 });
    expect(summary.orders.map((o) => [o.id, o.overdue])).toEqual([['ORD-B', true], ['ORD-A', false]]);

    const rows = [{ AWB: 'AWB-B', 'COD Amount': '500', UTR: 'UTR1', 'Remittance Date': '05-10-2026' }];
    await importCodRemittance({ rows, apply: true });
    await importCodRemittance({ rows, apply: true }); // re-import is a no-op
    const settled = await Order.findOne({ id: 'ORD-B' });
    expect(settled.cod_remittance).toMatchObject({ status: 'remitted', remitted_amount: 500, discrepancy: 0 });
    expect(settled.cod_remittance.entries).toHaveLength(1);

    summary = await codRemittanceSummary({ overdueDays: 10 });
    expect(summary).toMatchObject({ awaiting_count: 1, awaiting_amount: 500, overdue_count: 0 });
  });
});
