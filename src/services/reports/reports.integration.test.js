import mongoose from 'mongoose';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { buildReportWorkbook, runReport } from './index.js';

// Same dedicated replica-set database convention as the other suites.
const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const db = () => mongoose.connection.db;
const range = { from: '2026-09-01', to: '2026-09-30' };

suite('sales reports with real MongoDB', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    for (const name of ['orders', 'order_items', 'products', 'categories', 'brands']) await db().collection(name).deleteMany({});

    const [audio, gaming] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await db().collection('categories').insertMany([{ _id: audio, name: 'Audio' }, { _id: gaming, name: 'Gaming' }]);
    const sony = new mongoose.Types.ObjectId();
    await db().collection('brands').insertOne({ _id: sony, name: 'Sony' });
    const headset = new mongoose.Types.ObjectId();
    const cable = new mongoose.Types.ObjectId();
    await db().collection('products').insertMany([
      { _id: headset, name: 'Headset', slug: 'headset', brand: sony, categories: [audio, gaming] },
      { _id: cable, name: 'Cable', slug: 'cable', brand: null, categories: [] },
    ]);

    const user = new mongoose.Types.ObjectId();
    const order = async (fields, items) => {
      const { insertedId } = await db().collection('orders').insertOne({
        user, deleted_at: null, order_status: 'delivered', payment_method: 'cod', is_partial_cod: false,
        discount: 0, shipping: 0, cod_fee: 0, ...fields,
      });
      await db().collection('order_items').insertMany(items.map((item) => ({ order_id: insertedId, ...item })));
    };
    // 1 Sep: prepaid, coupon SAVE10, headset ×2
    await order({ id: 'O1', created_at: new Date('2026-09-01T10:00:00Z'), payment_method: 'razorpay', coupon_code: 'save10',
      total_items: 2, total_amount: 2000, discount: 200, shipping: 50, grand_total: 1850 },
    [{ product_id: headset, product_name: 'Headset', sku: 'HS-1', quantity: 2, unit_price: 1000, total_price: 2000, final_line_total: 1800, coupon_discount: 200, tax_amount: 274.58 }]);
    // 1 Sep: COD, cable ×1 (legacy item: no final_line_total)
    await order({ id: 'O2', created_at: new Date('2026-09-01T15:00:00Z'), total_items: 1, total_amount: 300, cod_fee: 20, grand_total: 320 },
      [{ product_id: cable, product_name: 'Cable', quantity: 1, unit_price: 300, total_price: 300 }]);
    // 3 Sep: partial COD, headset ×1
    await order({ id: 'O3', created_at: new Date('2026-09-03T09:00:00Z'), is_partial_cod: true, advance_amount: 200,
      total_items: 1, total_amount: 1000, grand_total: 1000 },
    [{ product_id: headset, product_name: 'Headset', sku: 'HS-1', quantity: 1, unit_price: 1000, total_price: 1000, final_line_total: 1000 }]);
    // 3 Sep: cancelled + refunded — excluded from sales, shown separately
    await order({ id: 'O4', created_at: new Date('2026-09-03T12:00:00Z'), order_status: 'cancelled', payment_method: 'razorpay',
      total_items: 1, total_amount: 500, grand_total: 500, refund: { status: 'processed', amount: 500 } },
    [{ product_id: cable, product_name: 'Cable', quantity: 1, unit_price: 500, total_price: 500, final_line_total: 500 }]);
    // Outside the range
    await order({ id: 'O5', created_at: new Date('2026-10-02T09:00:00Z'), total_items: 1, total_amount: 999, grand_total: 999 },
      [{ product_id: cable, product_name: 'Cable', quantity: 1, unit_price: 999, total_price: 999 }]);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it('sales over time fills every day and separates cancelled orders', async () => {
    const report = await runReport('sales', range);
    expect(report.rows).toHaveLength(30);
    expect(report.rows[0]).toMatchObject({ period: '2026-09-01', orders: 2, items: 3, gross_sales: 2300, discounts: 200, shipping: 50, cod_fees: 20, net_sales: 2170, avg_order_value: 1085 });
    expect(report.rows[1]).toMatchObject({ period: '2026-09-02', orders: 0, net_sales: 0 });
    expect(report.rows[2]).toMatchObject({ orders: 1, net_sales: 1000, cancelled_orders: 1, cancelled_value: 500, refunds: 500 });
    expect(report.totals).toMatchObject({ orders: 3, net_sales: 3170, cancelled_orders: 1, avg_order_value: 1056.67 });

    const monthly = await runReport('sales', { ...range, group_by: 'month' });
    expect(monthly.rows).toEqual([expect.objectContaining({ period: '2026-09', orders: 3, net_sales: 3170 })]);
    const weekly = await runReport('sales', { ...range, group_by: 'week' });
    expect(weekly.rows[0]).toMatchObject({ period: '2026-08-31', orders: 3 }); // Monday of that week
  });

  it('breaks sales down by product, category, brand, payment method and coupon', async () => {
    const products = await runReport('products', range);
    expect(products.rows.map((r) => [r.name, r.units, r.orders, r.net_sales])).toEqual([['Headset', 3, 2, 2800], ['Cable', 1, 1, 300]]);
    expect(products.totals).toMatchObject({ units: 4, net_sales: 3100, discounts: 200 });
    expect(products.pagination).toMatchObject({ totalDocs: 2, page: 1 });
    expect((await runReport('products', { ...range, search: 'cab' })).rows).toHaveLength(1);

    const categories = await runReport('categories', range);
    expect(categories.rows.map((r) => [r.name, r.net_sales])).toEqual(expect.arrayContaining([['Audio', 2800], ['Gaming', 2800], ['Uncategorised', 300]]));
    expect(categories.totals).toMatchObject({ units: 4, net_sales: 3100, orders: 3 }); // each sale once

    const brands = await runReport('brands', range);
    expect(brands.rows.map((r) => [r.name, r.units])).toEqual([['Sony', 3], ['No brand', 1]]);

    const payments = await runReport('payment_methods', range);
    expect(payments.rows.map((r) => [r._id, r.orders, r.net_sales])).toEqual([['prepaid', 1, 1850], ['partial_cod', 1, 1000], ['cod', 1, 320]]);
    expect(payments.rows.find((r) => r._id === 'partial_cod').advance_collected).toBe(200);

    const coupons = await runReport('coupons', range);
    expect(coupons.rows).toEqual([expect.objectContaining({ name: 'SAVE10', orders: 1, discounts: 200, net_sales: 1850, customers: 1 })]);

    const cod = await runReport('sales', { ...range, payment: 'cod' });
    expect(cod.totals.orders).toBe(1);
  });

  it('exports a report to Excel with a totals row', async () => {
    const { workbook, count } = await buildReportWorkbook('products', range);
    expect(count).toBe(2);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(3).values.slice(1, 4)).toEqual(['Product', 'Variation', 'SKU']);
    expect(sheet.getRow(4).getCell(1).value).toBe('Headset');
    expect(sheet.getRow(6).getCell(1).value).toBe('Total');
    expect(sheet.getRow(6).getCell(8).value).toBe(3100);
    await expect(buildReportWorkbook('coupons', { from: '2025-01-01', to: '2025-01-02' })).rejects.toThrow(/no data/);
  });
});
