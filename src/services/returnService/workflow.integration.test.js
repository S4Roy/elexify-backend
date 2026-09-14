import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../notification/sendReturnNotification.js', () => ({ sendReturnNotification: vi.fn() }));
vi.mock('../paymentService/refundRazorpayPayment.js', () => ({ fetchRazorpayPayment: vi.fn(), refundRazorpayPayment: vi.fn(), fetchRazorpayRefund: vi.fn() }));
vi.mock('../integrationCredentials/index.js', () => ({ getIntegrationConfig: vi.fn().mockResolvedValue({ channel_id: 'test-channel' }) }));
vi.mock('../shiprocket/returnShipment.js', () => ({ returnApi: vi.fn() }));
import { createReturnRequest, reviewReturnRequest, receiveReturnRequest, inspectReturnRequest, completeManualReturnRefund } from '../orderService/returnRequest.js';
import { applyReverseEvent, bookReversePickup } from './pickup.js';
import { processReturnRefund, settleReturnRefund } from './refund.js';
import { createReplacement, syncReplacement } from './replacement.js';
import { fetchRazorpayPayment, refundRazorpayPayment } from '../paymentService/refundRazorpayPayment.js';
import { returnApi } from '../shiprocket/returnShipment.js';
import Order from '../../models/Order.js';
import OrderItem from '../../models/OrderItem.js';
import Product from '../../models/Product.js';
import ReturnRequest from '../../models/ReturnRequest.js';
import StockTransaction from '../../models/StockTransaction.js';
import ShippingSettings from '../../models/ShippingSettings.js';

const uri = process.env.RETURN_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
let order, item, product;
const requestReturn = (quantity = 1, extra = {}) => createReturnRequest({ orderId: String(order._id), customerId: order.user,
  items: [{ order_item_id: String(item._id), quantity }], reason: 'Defective item', ...extra });
const received = async (extra = {}) => {
  const request = await requestReturn(1, extra);
  await reviewReturnRequest({ requestId: request._id, action: 'approve' });
  return receiveReturnRequest({ requestId: request._id });
};
const inspect = (request, accepted = 1) => inspectReturnRequest({ requestId: request._id, items: [{ return_item_id: String(request.items[0]._id), accepted_quantity: accepted, disposition: 'restock' }] });

suite('return workflow with real MongoDB transactions', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!url.pathname.startsWith('/elexify_return_test_')) throw new Error('Use a dedicated elexify_return_test_* database');
    await mongoose.connect(uri, { autoIndex: false });
    await Promise.all([Order.createIndexes(), ReturnRequest.createIndexes(), StockTransaction.createIndexes()]);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const name of ['orders','order_items','return_requests','stock_transactions','products','shipping_settings']) await mongoose.connection.db.collection(name).deleteMany({});
    await ShippingSettings.create({ returns_enabled: true, return_window_days: 7 });
    product = await Product.create({ name: 'Return test item', slug: 'return-test', sku: 'RET-TEST', regular_price: 100, stock_quantity: 5, status: 'active' });
    order = await Order.create({ id: `ORDER-${new mongoose.Types.ObjectId()}`, user: new mongoose.Types.ObjectId(), total_amount: 300, grand_total: 320, shipping: 50, discount: 30,
      order_status: 'delivered', payment_status: 'paid', payment_method: 'cod', delivered_at: new Date() });
    item = await OrderItem.create({ order_id: order._id, product_id: product._id, product_name: 'Return test item', sku: 'RET-TEST', quantity: 3, unit_price: 100, total_price: 300, coupon_discount: 30, final_line_total: 320, shipping_allocation: 50 });
  });
  it('creates a numbered partial request without changing the delivered order', async () => {
    const request = await requestReturn();
    expect(request.request_number).toMatch(/^RET-\d{4}-\d{4,}$/);
    expect((await Order.findById(order._id)).order_status).toBe('delivered');
    expect(request.items[0].refundable_unit_amount).toBe(90);
  });
  it('returns the same request for a retried submission key', async () => {
    const args = { submission_key: 'a546d567-fbd3-4b32-abba-dfba1850bcda' };
    const first = await requestReturn(1, args);
    expect(String((await requestReturn(1, args))._id)).toBe(String(first._id));
  });
  it('prevents concurrent excess returns', async () => {
    const results = await Promise.allSettled([requestReturn(2), requestReturn(2)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await ReturnRequest.countDocuments()).toBe(1);
  });
  it('allows later requests for remaining quantity and rejects excess', async () => {
    await requestReturn(1); await requestReturn(2);
    await expect(requestReturn(1)).rejects.toThrow(/eligible|quantity/i);
  });
  it('rejects expired windows and unauthorized customers', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { delivered_at: new Date(Date.now() - 8 * 86400000) } });
    await expect(requestReturn()).rejects.toThrow(/window/);
    await expect(requestReturn(1, { customerId: new mongoose.Types.ObjectId() })).rejects.toThrow(/not found/i);
  });
  it('requires Other comments and configured evidence', async () => {
    await expect(requestReturn(1, { reason: 'Other' })).rejects.toThrow(/describe/);
    await ShippingSettings.updateMany({}, { $set: { return_require_images: true } });
    await expect(requestReturn()).rejects.toThrow(/images/);
  });
  it('requires rejection remarks and releases rejected quantities', async () => {
    const request = await requestReturn(3);
    await expect(reviewReturnRequest({ requestId: request._id, action: 'reject' })).rejects.toThrow(/remark/);
    await reviewReturnRequest({ requestId: request._id, action: 'reject', note: 'Insufficient evidence' });
    await requestReturn(3);
  });
  it('requires receipt before QC', async () => {
    const request = await requestReturn();
    await expect(inspect(request)).rejects.toThrow(/ready/);
    expect((await Product.findById(product._id)).stock_quantity).toBe(5);
  });
  it('restocks once after passed QC and calculates a net partial refund', async () => {
    const request = await received();
    const results = await Promise.allSettled([inspect(request), inspect(request)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await Product.findById(product._id)).stock_quantity).toBe(6);
    expect(await StockTransaction.countDocuments({ reference_type: 'return' })).toBe(1);
    expect((await ReturnRequest.findById(request._id)).refund.amount).toBe(90);
  });
  it('does not restock or refund failed QC', async () => {
    const request = await inspect(await received(), 0);
    expect(request.status).toBe('qc_failed');
    expect(request.refund.amount).toBe(0);
    expect((await Product.findById(product._id)).stock_quantity).toBe(5);
  });
  it('rolls back QC and stock history on stock write failure', async () => {
    const request = await received();
    const spy = vi.spyOn(Product, 'updateOne').mockRejectedValueOnce(new Error('injected stock failure'));
    await expect(inspect(request)).rejects.toThrow('injected stock failure'); spy.mockRestore();
    expect((await ReturnRequest.findById(request._id)).status).toBe('received');
    expect(await StockTransaction.countDocuments()).toBe(0);
  });
  it('prevents duplicate manual settlement', async () => {
    const request = await inspect(await received());
    await completeManualReturnRefund({ requestId: request._id, reference: 'BANK-1' });
    await expect(completeManualReturnRefund({ requestId: request._id, reference: 'BANK-2' })).rejects.toThrow(/awaiting/);
    expect((await Order.findById(order._id)).payment_status).toBe('partially_refunded');
  });
  it('reserves a single linked replacement and completes it on delivery', async () => {
    const request = await inspect(await received({ return_type: 'replacement' }));
    expect(request.replacement_order_id).toBeTruthy();
    await createReplacement(request._id);
    expect(await Order.countDocuments({ replacement_return_id: request._id })).toBe(1);
    expect((await Product.findById(product._id)).stock_quantity).toBe(5);
    const replacement = await Order.findById(request.replacement_order_id);
    replacement.order_status = 'delivered';
    await syncReplacement(replacement);
    expect((await ReturnRequest.findById(request._id)).status).toBe('completed');
  });
  it('does not duplicate or regress reverse webhook events', async () => {
    let request = await requestReturn();
    request = await reviewReturnRequest({ requestId: request._id, action: 'approve' });
    const at = new Date();
    request = await applyReverseEvent({ request, raw: 'picked up', at });
    await applyReverseEvent({ request, raw: 'picked up', at });
    await applyReverseEvent({ request, raw: 'return initiated', at: new Date(at.getTime() - 1000) });
    request = await ReturnRequest.findById(request._id);
    expect(request.pickup.status).toBe('picked_up');
    expect(request.timeline.filter((e) => e.event === 'pickup_picked_up')).toHaveLength(1);
  });
  it('keeps approved state if reverse provider lookup fails', async () => {
    let request = await requestReturn();
    request = await reviewReturnRequest({ requestId: request._id, action: 'approve' });
    returnApi.mockRejectedValue(new Error('provider unavailable'));
    await expect(bookReversePickup({ requestId: request._id })).rejects.toThrow();
    request = await ReturnRequest.findById(request._id);
    expect(request.status).toBe('approved');
    expect(request.pickup.operation_token).toBeNull();
  });
  it('books a real-contract reverse order, AWB and pickup exactly once', async () => {
    let request = await requestReturn();
    request = await reviewReturnRequest({ requestId: request._id, action: 'approve' });
    await ReturnRequest.updateOne({ _id: request._id }, { $set: { pickup_address_snapshot: {
      full_name: 'Test Buyer', address_line_1: 'Test street', city: 'Kolkata', state: 'West Bengal', country: 'India', postcode: '700001', phone: '9000000000',
    } } });
    returnApi.mockReset();
    returnApi.mockResolvedValueOnce({ data: { shipping_address: [{ pickup_location: 'test-warehouse', name: 'Warehouse', address: 'Warehouse street', city: 'Kolkata', state: 'West Bengal', country: 'India', pin_code: '700001', phone: '9000000000' }] } })
      .mockResolvedValueOnce({ order_id: 100, shipment_id: 200 })
      .mockResolvedValueOnce({ response: { data: { awb_code: 'AWB-123', courier_name: 'Test Courier' } } })
      .mockResolvedValueOnce({ pickup_status: 1 });
    const args = { requestId: request._id, warehouse: 'test-warehouse', parcel: { length: 10, breadth: 10, height: 10, weight: 1 } };
    const booked = await bookReversePickup(args);
    expect(booked.pickup.shiprocket_shipment_id).toBe('200');
    expect(booked.pickup.status).toBe('scheduled');
    await bookReversePickup(args);
    expect(returnApi).toHaveBeenCalledTimes(4);
    expect(returnApi.mock.calls[1][2].order_id).toBe(request.request_number);
  });
  it('does not re-submit a pickup after an uncertain provider response', async () => {
    let request = await requestReturn();
    request = await reviewReturnRequest({ requestId: request._id, action: 'approve' });
    await ReturnRequest.updateOne({ _id: request._id }, { $set: { 'pickup.shiprocket_shipment_id': '200', 'pickup.shiprocket_awb': 'AWB-123', 'pickup.integration_status': 'created' } });
    returnApi.mockReset(); returnApi.mockRejectedValue(new Error('network timeout'));
    await expect(bookReversePickup({ requestId: request._id })).rejects.toThrow(/uncertain/);
    await expect(bookReversePickup({ requestId: request._id })).rejects.toThrow(/already assigned/);
    expect(returnApi).toHaveBeenCalledTimes(1);
  });
  it('rejects refunds over the remaining order balance atomically', async () => {
    const request = await received();
    await ReturnRequest.updateOne({ _id: request._id }, { $set: { 'items.0.refundable_request_paise': 999999 } });
    await expect(inspect(request)).rejects.toThrow(/remaining paid/);
    expect((await Product.findById(product._id)).stock_quantity).toBe(5);
    expect((await ReturnRequest.findById(request._id)).status).toBe('received');
  });
  it('submits refunds once and waits for verified completion', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { payment_method: 'razorpay', payment_meta: { razorpay_payment_id: 'pay_test' } } });
    fetchRazorpayPayment.mockResolvedValue({ amount: 32000, amount_refunded: 0 });
    refundRazorpayPayment.mockResolvedValue({ id: 'rf_test', amount: 9000, status: 'pending' });
    const request = await inspect(await received());
    expect(request.status).toBe('refund_pending');
    await processReturnRefund(request._id);
    expect(refundRazorpayPayment).toHaveBeenCalledTimes(1);
    await settleReturnRefund(request._id, { id: 'rf_test', amount: 9000, status: 'processed' });
    expect((await ReturnRequest.findById(request._id)).status).toBe('completed');
  });
});
