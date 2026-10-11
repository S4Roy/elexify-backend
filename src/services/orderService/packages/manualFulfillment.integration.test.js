import mongoose from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../../notification/sendOrderNotification.js', () => ({ sendOrderNotification: vi.fn() }));
import { dispatchManual, markManualDelivered, returnToStore } from './manualFulfillment.js';
import { returnEligibility } from '../../returnService/rules.js';
import Order from '../../../models/Order.js';
import OrderItem from '../../../models/OrderItem.js';
import Package from '../../../models/Package.js';
import ShippingSettings from '../../../models/ShippingSettings.js';
import Role from '../../../models/Role.js';
import User from '../../../models/User.js';
import { listDeliveryStaff, listMyDeliveries } from './deliveryRun.js';
import { newDeliveryOtp, resendDeliveryOtp } from './deliveryOtp.js';
import { sendSMS } from '../../sms/index.js';

// Never text anyone from tests; the code sent is read back from the mock.
vi.mock('../../sms/index.js', () => ({ sendSMS: vi.fn(async () => ({ success: true })) }));
vi.mock('../../smsTemplate/getTemplate.js', () => ({
  getTemplate: async () => ({ dlt_message_id: '189215', variables: ['name', 'purpose', 'otp'] }),
}));

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
    for (const name of ['orders', 'order_items', 'packages', 'shipping_settings', 'roles', 'users']) await mongoose.connection.db.collection(name).deleteMany({});
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

  it('assigns a staff rider who sees and completes only their own delivery', async () => {
    const role = await Role.create({ name: 'Delivery Staff', key: 'test-delivery', permissions: ['delivery.run'], status: 'active' });
    const clerkRole = await Role.create({ name: 'Clerk', key: 'test-clerk', permissions: ['orders.view'], status: 'active' });
    const rider = await User.create({ name: 'Ravi', role: 'staff', mobile: '9876500001', admin_role_id: role._id });
    const clerk = await User.create({ name: 'Clerk', role: 'staff', mobile: '9876500002', admin_role_id: clerkRole._id });

    expect((await listDeliveryStaff()).map((s) => s.name)).toEqual(['Ravi']);
    await expect(dispatchManual({ orderId: String(order._id), mode: 'self_delivery', agent: { user_id: String(clerk._id) }, reason: 'Local run', adminId: admin }))
      .rejects.toThrow(/Delivery Staff permission/);

    const { pkg } = await dispatchManual({ orderId: String(order._id), mode: 'self_delivery', agent: { user_id: String(rider._id) }, reason: 'Local run', adminId: admin });
    expect(pkg.delivery_agent).toMatchObject({ name: 'Ravi', phone: '9876500001' });
    expect((await listMyDeliveries(clerk._id)).open).toHaveLength(0);
    const mine = await listMyDeliveries(rider._id);
    expect(mine.open).toHaveLength(1);
    expect(mine.open[0]).toMatchObject({ order_number: order.id, cod_due: 320 });

    await expect(markManualDelivered({ packageId: String(pkg._id), deliveredAt: new Date(), receiverName: 'Asha',
      codCollection: { amount: 320, method: 'cash' }, adminId: clerk._id, riderId: clerk._id })).rejects.toThrow(/not found/);
    await markManualDelivered({ packageId: String(pkg._id), deliveredAt: new Date(), receiverName: 'Asha',
      codCollection: { amount: 320, method: 'cash' }, adminId: rider._id, riderId: rider._id });
    expect(await Order.findById(order._id)).toMatchObject({ order_status: 'delivered', payment_status: 'paid' });
    const after = await listMyDeliveries(rider._id);
    expect(after.open).toHaveLength(0);
    expect(after.done[0]).toMatchObject({ order_number: order.id, received_by: 'Asha' });
  });

  it('verifies the handover code, counts wrong guesses and keeps the hash out of normal reads', async () => {
    await User.create({ _id: order.user, name: 'Asha', role: 'user', phone_code: '91', mobile: '9123456780' });
    const { pkg, otpSent } = await dispatchManual({ orderId: String(order._id), mode: 'store_pickup', agent: { name: 'Counter' }, reason: 'Pickup requested', adminId: admin });
    expect(otpSent).toBe(true);
    const firstCode = sendSMS.mock.calls.at(-1)[0].variables[2];
    expect(sendSMS.mock.calls.at(-1)[0]).toMatchObject({ to: '919123456780', variables: ['Asha', 'Pickup', firstCode] });
    expect((await Package.findById(pkg._id)).delivery_otp).toBeUndefined();
    expect((await Package.findById(pkg._id).select('+delivery_otp')).delivery_otp).toMatchObject({ sent_count: 1, failed_attempts: 0 });

    // A wrong code is rejected and still counted, though the delivery rolled back.
    const wrong = firstCode === '0000' ? '1111' : '0000';
    await expect(markManualDelivered({ packageId: String(pkg._id), deliveredAt: new Date(), receiverName: 'Asha', otp: wrong,
      codCollection: { amount: 320, method: 'cash' }, adminId: admin })).rejects.toThrow(/Wrong code/);
    expect((await Package.findById(pkg._id).select('+delivery_otp')).delivery_otp.failed_attempts).toBe(1);
    expect((await Package.findById(pkg._id)).status).toBe('packed');

    // Resend replaces the code; the old one stops working.
    await expect(resendDeliveryOtp({ packageId: String(pkg._id) })).rejects.toThrow(/Wait/);
    await Package.updateOne({ _id: pkg._id }, { $set: { 'delivery_otp.last_sent_at': new Date(Date.now() - 120_000) } });
    await resendDeliveryOtp({ packageId: String(pkg._id) });
    const secondCode = sendSMS.mock.calls.at(-1)[0].variables[2];
    expect((await Package.findById(pkg._id).select('+delivery_otp')).delivery_otp).toMatchObject({ sent_count: 2, failed_attempts: 1 });

    await markManualDelivered({ packageId: String(pkg._id), deliveredAt: new Date(), receiverName: 'Asha', otp: secondCode,
      codCollection: { amount: 320, method: 'cash' }, adminId: admin });
    expect((await Package.findById(pkg._id)).proof_of_delivery.otp_verified).toBe(true);
    expect(newDeliveryOtp(pkg._id).code).toMatch(/^\d{4}$/);
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
