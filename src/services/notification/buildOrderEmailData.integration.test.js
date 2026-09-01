import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_build_order_email_data_integration$1"
);
const suite = uri ? describe : describe.skip;

const { buildOrderEmailData } = await import("./buildOrderEmailData.js");
const User = (await import("../../models/User.js")).default;
const Order = (await import("../../models/Order.js")).default;
const OrderItem = (await import("../../models/OrderItem.js")).default;
const Address = (await import("../../models/Address.js")).default;

const createUser = async () =>
  User.create({ role: "customer", name: "Order Data Test User", email: "order.data.test@example.com", status: "active" });

const createAddress = async (userId) =>
  Address.create({
    user: userId,
    full_name: "Order Data Test User",
    phone: "9111111111",
    address_line_1: "123 Main St",
    address_line_2: "Near the park",
    city_name: "Kolkata",
    state_name: "West Bengal",
    country_name: "India",
    postcode: "700001",
  });

suite("buildOrderEmailData", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("builds order-level fields, item snapshots, and address from the shipping_address_snapshot", async () => {
    const user = await createUser();
    const order = await Order.create({
      id: "ORD-BUILD-1",
      user: user._id,
      payment_method: "cod",
      payment_status: "paid",
      order_status: "confirmed",
      total_amount: 998,
      discount: 50,
      coupon_code: "SAVE50",
      shipping: 40,
      grand_total: 988,
      courier_name: "Delhivery",
      awb: "TRK123",
      shipping_address_snapshot: {
        full_name: "Snapshot Name",
        address_line_1: "Snapshot Line 1",
        address_line_2: null,
        city: "Snapshot City",
        state: "Snapshot State",
        country: "India",
        postcode: "700002",
      },
    });
    await OrderItem.create({
      order_id: order._id,
      product_id: new mongoose.Types.ObjectId(),
      quantity: 2,
      unit_price: 499,
      total_price: 998,
      product_name: "Wireless Mouse",
      variation_name: null,
    });

    const data = await buildOrderEmailData(order);

    expect(data.order_id).toBe("ORD-BUILD-1");
    expect(data.order_number).toBe("ORD-BUILD-1");
    expect(data.is_cod).toBe(true);
    expect(data.payment_method_label).toBe("Cash on Delivery");
    expect(data.order_status_label).toBe("Confirmed");
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ product_name: "Wireless Mouse", quantity: 2, unit_price: 499, total_price: 998 });
    expect(data.discount).toBe(50);
    expect(data.coupon_code).toBe("SAVE50");
    expect(data.grand_total).toBe(988);
    expect(data.courier_name).toBe("Delhivery");
    expect(data.tracking_number).toBe("TRK123");
    expect(data.shipping_address).toMatchObject({ name: "Snapshot Name", line1: "Snapshot Line 1", city: "Snapshot City" });
    expect(data.view_order_url).toContain("ORD-BUILD-1");
  });

  it("falls back to the live Address doc when shipping_address_snapshot is null (order placed before snapshots existed)", async () => {
    const user = await createUser();
    const address = await createAddress(user._id);
    const order = await Order.create({
      id: "ORD-BUILD-2",
      user: user._id,
      payment_method: "razorpay",
      payment_status: "paid",
      order_status: "confirmed",
      total_amount: 500,
      grand_total: 500,
      shipping_address: address._id,
      shipping_address_snapshot: null,
    });

    const data = await buildOrderEmailData(order);

    expect(data.is_cod).toBe(false);
    expect(data.payment_method_label).toBe("Online Payment");
    expect(data.shipping_address).toMatchObject({ name: "Order Data Test User", city: "Kolkata", pincode: "700001" });
  });

  it("returns an empty items array and null address when there are none", async () => {
    const user = await createUser();
    const order = await Order.create({
      id: "ORD-BUILD-3",
      user: user._id,
      payment_method: "cod",
      total_amount: 100,
      grand_total: 100,
    });

    const data = await buildOrderEmailData(order);

    expect(data.items).toEqual([]);
    expect(data.shipping_address).toBeNull();
    expect(data.courier_name).toBeNull();
    expect(data.tracking_number).toBeNull();
  });
});
