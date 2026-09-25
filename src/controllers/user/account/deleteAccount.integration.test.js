import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_account_deletion_integration$1"
);
const suite = uri ? describe : describe.skip;

const sentSms = [];
vi.mock("../../../services/sms/index.js", () => ({
  sendSMS: vi.fn(({ to, variables }) => {
    sentSms.push({ to, variables });
    return Promise.resolve({ success: true });
  }),
}));
vi.mock("../../../services/smsTemplate/index.js", () => ({
  getTemplate: vi.fn(() =>
    Promise.resolve({ dlt_message_id: "test", variables: ["name", "purpose", "otp"] })
  ),
  runSeedSmsTemplates: vi.fn(),
}));
vi.mock("../../../services/email/index.js", () => ({
  sendEmail: vi.fn(() => Promise.resolve(true)),
}));

const { deletionStatus, requestAccountDeletion, confirmAccountDeletion } = await import(
  "./deleteAccount.js"
);
const { isAccountClosed } = await import("../../../services/user/accountDeletion.js");
const User = (await import("../../../models/User.js")).default;
const Order = (await import("../../../models/Order.js")).default;
const Address = (await import("../../../models/Address.js")).default;
const Cart = (await import("../../../models/Cart.js")).default;
const Wishlist = (await import("../../../models/Wishlist.js")).default;
const DeviceToken = (await import("../../../models/DeviceToken.js")).default;

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const mockReq = (overrides = {}) => ({
  ip: "127.0.0.1",
  headers: { "user-agent": "vitest" },
  __: (str) => str,
  ...overrides,
});

const rethrow = (err) => {
  if (err) throw err;
};

const createUser = (overrides = {}) =>
  User.create({
    role: "customer",
    name: "Test User",
    email: "test@example.com",
    email_verified_at: new Date(),
    phone_code: "91",
    mobile: "9000000000",
    mobile_verified_at: new Date(),
    status: "active",
    ...overrides,
  });

// Raw inserts: these tests only need the fields deletion looks at.
const insertOrder = (doc) => Order.collection.insertOne({ created_at: new Date(), ...doc });
const insertAddress = (doc) =>
  Address.collection.insertOne({ deleted_at: null, is_default: false, ...doc });

async function requestCode(user) {
  await requestAccountDeletion(mockReq({ auth: { user_id: String(user._id) } }), mockRes(), rethrow);
  return sentSms.at(-1).variables[2];
}

suite("account deletion flow", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    sentSms.length = 0;
    await mongoose.connection.db.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("erases personal data, removes account data and keeps orders", async () => {
    const user = await createUser();
    const oldAddress = await insertAddress({ user: user._id, name: "Home" });
    const orderAddress = await insertAddress({ user: user._id, name: "Office" });
    await insertOrder({
      user: user._id,
      order_status: "delivered",
      payment_status: "paid",
      shipping_address: orderAddress.insertedId,
    });
    await Cart.collection.insertOne({ user: user._id });
    await Wishlist.collection.insertOne({ user: user._id });
    await DeviceToken.collection.insertOne({ user_id: user._id, token: "t" });

    const otp = await requestCode(user);
    expect(sentSms[0].to).toBe("919000000000");

    await confirmAccountDeletion(
      mockReq({ auth: { user_id: String(user._id) }, body: { otp, reason: "privacy" } }),
      mockRes(),
      rethrow
    );

    const deleted = await User.findById(user._id).lean();
    expect(deleted.deleted_at).toBeTruthy();
    expect(deleted.status).toBe("inactive");
    expect(deleted.name).toBe("Deleted user");
    expect(deleted.email).toBeUndefined();
    expect(deleted.mobile).toBeNull();
    expect(deleted.account_deletion.reason).toBe("privacy");

    expect(await Address.findById(oldAddress.insertedId)).toBeNull();
    expect((await Address.findById(orderAddress.insertedId).lean()).deleted_at).toBeTruthy();
    expect(await Order.countDocuments({ user: user._id })).toBe(1);
    expect(await Cart.countDocuments({ user: user._id })).toBe(0);
    expect(await Wishlist.countDocuments({ user: user._id })).toBe(0);
    expect(await DeviceToken.countDocuments({ user_id: user._id })).toBe(0);

    // Existing sessions stop working, and the number can sign up again.
    expect(await isAccountClosed(user._id, Math.floor(Date.now() / 1000))).toBe(true);
    await expect(createUser()).resolves.toBeTruthy();
  });

  it("refuses while an order is still on its way", async () => {
    const user = await createUser();
    await insertOrder({ user: user._id, order_status: "shipped", payment_status: "paid" });

    const res = mockRes();
    await deletionStatus(mockReq({ auth: { user_id: String(user._id) } }), res, rethrow);
    const { data } = res.json.mock.calls[0][0];
    expect(data.can_delete).toBe(false);
    expect(data.blockers.map((b) => b.code)).toEqual(["ACTIVE_ORDERS"]);

    let error;
    await requestAccountDeletion(mockReq({ auth: { user_id: String(user._id) } }), mockRes(), (e) => {
      error = e;
    });
    expect(error?.message).toMatch(/still being processed/);
    expect(sentSms).toHaveLength(0);
  });

  it("does not count an unpaid checkout as an active order", async () => {
    const user = await createUser();
    await insertOrder({ user: user._id, order_status: "pending", payment_status: "pending" });

    const res = mockRes();
    await deletionStatus(mockReq({ auth: { user_id: String(user._id) } }), res, rethrow);
    expect(res.json.mock.calls[0][0].data.can_delete).toBe(true);
  });

  it("keeps the account when the code is wrong", async () => {
    const user = await createUser();
    const otp = await requestCode(user);
    const wrong = otp === "000000" ? "111111" : "000000";

    let error;
    await confirmAccountDeletion(
      mockReq({ auth: { user_id: String(user._id) }, body: { otp: wrong } }),
      mockRes(),
      (e) => {
        error = e;
      }
    );
    expect(error).toBeTruthy();
    expect((await User.findById(user._id).lean()).deleted_at).toBeNull();
  });

  it("sends the code by email when there is no verified mobile", async () => {
    const user = await createUser({ mobile: null, phone_code: null, mobile_verified_at: null });
    const res = mockRes();
    await requestAccountDeletion(mockReq({ auth: { user_id: String(user._id) } }), res, rethrow);
    expect(res.json.mock.calls[0][0].data.otp_channel).toBe("email");
    expect(sentSms).toHaveLength(0);
  });
});
