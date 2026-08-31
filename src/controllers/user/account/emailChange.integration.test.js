import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_email_change_integration$1"
);
const suite = uri ? describe : describe.skip;

// Capture the plaintext OTP handed to the (mocked) email provider — the DB
// only ever stores the bcrypt hash, exactly as intended.
const sentEmails = [];
vi.mock("../../../services/email/index.js", () => ({
  sendEmail: vi.fn((email, type, subject, language, data) => {
    sentEmails.push({ email, type, data });
    return Promise.resolve(true);
  }),
}));
vi.mock("../../../services/sms/index.js", () => ({
  sendSMS: vi.fn(() => Promise.resolve({ success: true })),
}));

const { requestEmailChange } = await import("./requestEmailChange.js");
const { verifyEmailChange } = await import("./verifyEmailChange.js");
const User = (await import("../../../models/User.js")).default;
const OtpVerification = (await import("../../../models/OtpVerification.js")).default;

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const mockReq = (overrides = {}) => ({
  ip: "127.0.0.1",
  headers: { "user-agent": "vitest" },
  __: (str, vars) =>
    vars ? str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]) : str,
  ...overrides,
});

const createUser = async (overrides = {}) =>
  User.create({
    role: "customer",
    name: "Test User",
    email: "original@example.com",
    email_verified_at: new Date(),
    status: "active",
    ...overrides,
  });

suite("email change flow", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    sentEmails.length = 0;
    await mongoose.connection.db.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("sets pending_email and leaves the verified email untouched until OTP verification", async () => {
    const user = await createUser();
    const req = mockReq({
      auth: { user_id: String(user._id) },
      body: { email: "new@example.com" },
    });
    const res = mockRes();

    await requestEmailChange(req, res, (err) => {
      throw err;
    });

    const reloaded = await User.findById(user._id);
    expect(reloaded.email).toBe("original@example.com");
    expect(reloaded.pending_email).toBe("new@example.com");
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].email).toBe("new@example.com");
  });

  it("promotes pending_email to email only after correct OTP verification", async () => {
    const user = await createUser();
    const reqSend = mockReq({
      auth: { user_id: String(user._id) },
      body: { email: "new@example.com" },
    });
    await requestEmailChange(reqSend, mockRes(), (err) => {
      throw err;
    });

    const otpRecord = await OtpVerification.findOne({
      identifier: "new@example.com",
      purpose: "change_email",
    });
    // We can't read the plaintext OTP back from the DB (hash-only, by
    // design) — recover it from the mocked email delivery instead.
    const otp = sentEmails[0].data.otp;
    expect(otp).toMatch(/^\d{6}$/);

    const reqVerify = mockReq({
      auth: { user_id: String(user._id) },
      body: { otp },
    });
    const resVerify = mockRes();
    await verifyEmailChange(reqVerify, resVerify, (err) => {
      throw err;
    });

    const reloaded = await User.findById(user._id);
    expect(reloaded.email).toBe("new@example.com");
    expect(reloaded.pending_email).toBeNull();
    expect(reloaded.email_verified_at).toBeTruthy();

    const consumed = await OtpVerification.findById(otpRecord._id);
    expect(consumed.verified_at).toBeTruthy();

    // Old (original) address gets a "your email was changed" notice too.
    expect(sentEmails.some((m) => m.email === "original@example.com")).toBe(true);
  });

  it("rejects an incorrect OTP without promoting pending_email", async () => {
    const user = await createUser();
    await requestEmailChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { email: "new@example.com" } }),
      mockRes(),
      (err) => {
        throw err;
      }
    );

    const req = mockReq({ auth: { user_id: String(user._id) }, body: { otp: "000000" } });
    const res = mockRes();
    let caught;
    await verifyEmailChange(req, res, (err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(400);

    const reloaded = await User.findById(user._id);
    expect(reloaded.email).toBe("original@example.com");
    expect(reloaded.pending_email).toBe("new@example.com");
  });

  it("locks out further attempts after max_attempts wrong OTPs", async () => {
    const user = await createUser();
    await requestEmailChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { email: "new@example.com" } }),
      mockRes(),
      (err) => {
        throw err;
      }
    );

    const { envs } = await import("../../../config/index.js");
    let lastError;
    for (let i = 0; i < envs.otp.max_attempts; i++) {
      await verifyEmailChange(
        mockReq({ auth: { user_id: String(user._id) }, body: { otp: "000000" } }),
        mockRes(),
        (err) => {
          lastError = err;
        }
      );
    }

    expect(lastError.statusCode).toBe(429);
  });

  it("rejects a change to an email already used by another account", async () => {
    await createUser({ email: "taken@example.com", _id: new mongoose.Types.ObjectId() });
    const user = await createUser({ email: "self@example.com" });

    const req = mockReq({
      auth: { user_id: String(user._id) },
      body: { email: "taken@example.com" },
    });
    const res = mockRes();
    let caught;
    await requestEmailChange(req, res, (err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(400);
    const reloaded = await User.findById(user._id);
    expect(reloaded.pending_email).toBeNull();
  });

  it("does not persist pending_email when OTP delivery fails", async () => {
    const { sendEmail } = await import("../../../services/email/index.js");
    sendEmail.mockImplementationOnce(() => Promise.resolve(false));

    const user = await createUser();
    let caught;
    await requestEmailChange(
      mockReq({ auth: { user_id: String(user._id) }, body: { email: "new@example.com" } }),
      mockRes(),
      (err) => {
        caught = err;
      }
    );

    expect(caught).toBeTruthy();
    const reloaded = await User.findById(user._id);
    expect(reloaded.pending_email).toBeNull();
  });

  it("enforces the resend cooldown", async () => {
    const user = await createUser();
    const req = () =>
      mockReq({ auth: { user_id: String(user._id) }, body: { email: "new@example.com" } });

    await requestEmailChange(req(), mockRes(), (err) => {
      throw err;
    });

    let caught;
    await requestEmailChange(req(), mockRes(), (err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(429);
  });
});
