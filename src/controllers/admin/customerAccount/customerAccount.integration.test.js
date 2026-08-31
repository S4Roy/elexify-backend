import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_admin_customer_integration$1"
);
const suite = uri ? describe : describe.skip;

const { details } = await import("./details.js");
const { verificationOverride } = await import("./verificationOverride.js");
const { getNotificationPreferences, updateNotificationPreferences } = await import(
  "./notificationPreferences.js"
);
const { requirePermission } = await import("../../../middleware/requirePermission.js");
const { PERMISSIONS } = await import("../../../constants/adminPermissions.js");
const User = (await import("../../../models/User.js")).default;
const AuditLog = (await import("../../../models/AuditLog.js")).default;
const NotificationPreference = (await import("../../../models/NotificationPreference.js")).default;

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

const createCustomer = async (overrides = {}) =>
  User.create({
    role: "customer",
    name: "Admin Test Customer",
    email: "admin.test.customer@example.com",
    mobile: "9111111111",
    phone_code: "91",
    status: "active",
    ...overrides,
  });

const createAdmin = async (role = "superadmin") =>
  User.create({ role, name: `Admin (${role})`, email: `${role}@example.com`, status: "active" });

suite("admin customer account API", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("returns masked pending contact values and verification status", async () => {
    const customer = await createCustomer({
      email_verified_at: new Date(),
      pending_mobile: "9222222222",
      pending_phone_code: "91",
    });

    const req = mockReq({ params: { id: String(customer._id) } });
    const res = mockRes();
    await details(req, res, (err) => {
      throw err;
    });

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.email_verified).toBe(true);
    expect(payload.data.mobile_verified).toBe(false);
    expect(payload.data.pending_mobile).toBe("+91 ******2222");
    expect(payload.data.pending_mobile).not.toContain("922222"); // never the full number
  });

  it("requirePermission blocks a role without the permission (403)", async () => {
    const req = mockReq({ auth: { role: "staff" } });
    const res = mockRes();
    let caught;
    const middleware = requirePermission(PERMISSIONS.CUSTOMER_VERIFICATION_OVERRIDE);
    middleware(req, res, (err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(403);
  });

  it("requirePermission allows a role with the permission", async () => {
    const req = mockReq({ auth: { role: "superadmin" } });
    const res = mockRes();
    let caught;
    let nextCalledCleanly = false;
    const middleware = requirePermission(PERMISSIONS.CUSTOMER_VERIFICATION_OVERRIDE);
    middleware(req, res, (err) => {
      if (err) caught = err;
      else nextCalledCleanly = true;
    });

    expect(caught).toBeUndefined();
    expect(nextCalledCleanly).toBe(true);
  });

  it("verification override requires a reason and sets verified_at + audit log with actor/reason/previous+new state", async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();

    const reqNoReason = mockReq({
      params: { id: String(customer._id) },
      body: { channel: "mobile", reason: "" },
      auth: { user_id: String(admin._id) },
    });
    let caught;
    await verificationOverride(reqNoReason, mockRes(), (err) => {
      caught = err;
    });
    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(400);

    const req = mockReq({
      params: { id: String(customer._id) },
      body: { channel: "mobile", reason: "Customer called support and verified identity by ID" },
      auth: { user_id: String(admin._id) },
    });
    await verificationOverride(req, mockRes(), (err) => {
      throw err;
    });

    const reloaded = await User.findById(customer._id);
    expect(reloaded.mobile_verified_at).toBeTruthy();

    const audit = await AuditLog.findOne({ user_id: customer._id, event: "CONTACT_VERIFICATION_OVERRIDE" });
    expect(audit).toBeTruthy();
    expect(String(audit.actor_id)).toBe(String(admin._id));
    expect(audit.reason).toContain("support");
    expect(audit.metadata.channel).toBe("mobile");
    expect(audit.metadata.previous_state).toBe("unverified");
    expect(audit.metadata.new_state).toBe("verified");
  });

  it("admin cannot disable a mandatory notification preference", async () => {
    const customer = await createCustomer();
    await NotificationPreference.create({ user_id: customer._id });

    const req = mockReq({
      params: { id: String(customer._id) },
      body: { security: { email: false } },
      auth: { user_id: "000000000000000000000001" },
    });
    let caught;
    await updateNotificationPreferences(req, mockRes(), (err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(400);
  });

  it("admin can update a non-mandatory (marketing) preference, and it's audited", async () => {
    const customer = await createCustomer();
    await NotificationPreference.create({ user_id: customer._id });
    const admin = await createAdmin();

    const req = mockReq({
      params: { id: String(customer._id) },
      body: { marketing: { email: true } },
      auth: { user_id: String(admin._id) },
    });
    await updateNotificationPreferences(req, mockRes(), (err) => {
      throw err;
    });

    const updated = await NotificationPreference.findOne({ user_id: customer._id });
    expect(updated.marketing.email).toBe(true);

    const audit = await AuditLog.findOne({
      user_id: customer._id,
      event: "NOTIFICATION_PREFERENCE_ADMIN_CHANGE",
    });
    expect(audit).toBeTruthy();
    expect(String(audit.actor_id)).toBe(String(admin._id));
  });

  it("GET notification-preferences reports why a channel is unavailable via verification flags", async () => {
    const customer = await createCustomer({ email_verified_at: null });
    const req = mockReq({ params: { id: String(customer._id) } });
    const res = mockRes();
    await getNotificationPreferences(req, res, (err) => {
      throw err;
    });

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.email_verified).toBe(false);
    expect(payload.data.mobile_verified).toBe(false);
    expect(payload.data.mandatory_locked_paths).toContain("security.email");
  });
});
