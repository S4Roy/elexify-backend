import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_mobile_change_integration$1"
);
const suite = uri ? describe : describe.skip;

const sentSms = [];
vi.mock("../../../services/sms/index.js", () => ({
  sendSMS: vi.fn(({ to, variables }) => {
    sentSms.push({ to, variables });
    return Promise.resolve({ success: true });
  }),
}));
vi.mock("../../../services/email/index.js", () => ({
  sendEmail: vi.fn(() => Promise.resolve(true)),
}));

const { requestMobileChange } = await import("./requestMobileChange.js");
const { verifyMobileChange } = await import("./verifyMobileChange.js");
const User = (await import("../../../models/User.js")).default;

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const mockReq = (overrides = {}) => ({
  ip: "127.0.0.1",
  headers: { "user-agent": "vitest" },
  __: (str, vars) => (vars ? str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]) : str),
  ...overrides,
});

const createUser = async (overrides = {}) =>
  User.create({
    role: "customer",
    name: "Test User",
    phone_code: "91",
    mobile: "9000000000",
    mobile_verified_at: new Date(),
    status: "active",
    ...overrides,
  });

suite("mobile change flow", () => {
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

  it("sets pending_mobile and leaves the verified mobile untouched until OTP verification", async () => {
    const user = await createUser();
    await requestMobileChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { phone_code: "91", mobile: "8111111111" } }),
      mockRes(),
      (err) => {
        throw err;
      }
    );

    const reloaded = await User.findById(user._id);
    expect(reloaded.mobile).toBe("9000000000");
    expect(reloaded.pending_mobile).toBe("8111111111");
    expect(sentSms).toHaveLength(1);
  });

  it("promotes pending_mobile to mobile only after correct OTP verification", async () => {
    const user = await createUser();
    await requestMobileChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { phone_code: "91", mobile: "8111111111" } }),
      mockRes(),
      (err) => {
        throw err;
      }
    );

    const otp = sentSms[0].variables[2];
    expect(otp).toMatch(/^\d{6}$/);

    const reloaded1 = await User.findById(user._id);
    expect(reloaded1.mobile).toBe("9000000000");

    await verifyMobileChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { otp } }),
      mockRes(),
      (err) => {
        throw err;
      }
    );

    const reloaded2 = await User.findById(user._id);
    expect(reloaded2.mobile).toBe("8111111111");
    expect(reloaded2.pending_mobile).toBeNull();
    expect(reloaded2.mobile_verified_at).toBeTruthy();
  });

  it("rejects a change to a mobile number already used by another account", async () => {
    await createUser({ phone_code: "91", mobile: "8222222222" });
    const user = await createUser({ phone_code: "91", mobile: "9333333333" });

    let caught;
    await requestMobileChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { phone_code: "91", mobile: "8222222222" } }),
      mockRes(),
      (err) => {
        caught = err;
      }
    );

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(400);
  });

  it("does not persist pending_mobile when OTP delivery fails", async () => {
    const { sendSMS } = await import("../../../services/sms/index.js");
    sendSMS.mockImplementationOnce(() => Promise.resolve({ success: false }));

    const user = await createUser();
    let caught;
    await requestMobileChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { phone_code: "91", mobile: "8111111111" } }),
      mockRes(),
      (err) => {
        caught = err;
      }
    );

    expect(caught).toBeTruthy();
    const reloaded = await User.findById(user._id);
    expect(reloaded.pending_mobile).toBeNull();
  });
});
