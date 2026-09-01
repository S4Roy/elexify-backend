import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_admin_email_template_integration$1"
);
const suite = uri ? describe : describe.skip;

const emailCalls = [];
vi.mock("../../../services/email/index.js", () => ({
  sendEmail: vi.fn((...args) => {
    emailCalls.push(args);
    return Promise.resolve(true);
  }),
}));

const { list } = await import("./list.js");
const { details } = await import("./details.js");
const { update } = await import("./update.js");
const { resetToDefault } = await import("./resetToDefault.js");
const { preview } = await import("./preview.js");
const { sendTest } = await import("./sendTest.js");
const { requirePermission } = await import("../../../middleware/requirePermission.js");
const { PERMISSIONS } = await import("../../../constants/adminPermissions.js");
const EmailTemplate = (await import("../../../models/EmailTemplate.js")).default;
const AuditLog = (await import("../../../models/AuditLog.js")).default;
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
  query: {},
  params: {},
  body: {},
  ...overrides,
});

const createAdmin = async (role = "superadmin") =>
  User.create({ role, name: `Admin (${role})`, email: `${role}.emailtpl@example.com`, status: "active" });

const seedTemplate = async (overrides = {}) =>
  EmailTemplate.create({
    action: "order_cancelled",
    site_language: "en",
    subject: "Order Cancelled — {{order_id}}",
    preheader: "Your order {{order_id}} has been cancelled.",
    body: "<p>Hi {{name}}, your order {{order_id}} has been cancelled.</p>",
    required_variables: ["name", "order_id"],
    is_marketing: false,
    template_version: 2,
    status: "active",
    ...overrides,
  });

suite("admin email template API", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    emailCalls.length = 0;
    await mongoose.connection.db.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("lists templates without exposing body/required_variables in the summary", async () => {
    await seedTemplate();
    const req = mockReq();
    const res = mockRes();
    await list(req, res, (err) => {
      throw err;
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].action).toBe("order_cancelled");
    expect(payload.data[0].body).toBeUndefined();
  });

  it("lists filter by status and is_marketing", async () => {
    await seedTemplate({ action: "order_cancelled", status: "active", is_marketing: false });
    await seedTemplate({ action: "promotional_offer", status: "inactive", is_marketing: true });

    const inactiveReq = mockReq({ query: { status: "inactive" } });
    const inactiveRes = mockRes();
    await list(inactiveReq, inactiveRes, (err) => {
      throw err;
    });
    const inactivePayload = inactiveRes.json.mock.calls[0][0];
    expect(inactivePayload.data.map((t) => t.action)).toEqual(["promotional_offer"]);

    const marketingReq = mockReq({ query: { is_marketing: "yes" } });
    const marketingRes = mockRes();
    await list(marketingReq, marketingRes, (err) => {
      throw err;
    });
    const marketingPayload = marketingRes.json.mock.calls[0][0];
    expect(marketingPayload.data.map((t) => t.action)).toEqual(["promotional_offer"]);
  });

  it("returns full details by action", async () => {
    await seedTemplate();
    const req = mockReq({ params: { action: "order_cancelled" } });
    const res = mockRes();
    await details(req, res, (err) => {
      throw err;
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.body).toContain("{{order_id}}");
  });

  it("update overwrites subject/preheader/body and audits the change with the actor", async () => {
    await seedTemplate();
    const admin = await createAdmin();
    const req = mockReq({
      params: { action: "order_cancelled" },
      body: { subject: "New Subject — {{order_id}}", preheader: "New preheader", body: "<p>New body {{order_id}}</p>" },
      auth: { user_id: admin._id, role: "superadmin" },
    });
    const res = mockRes();
    await update(req, res, (err) => {
      throw err;
    });

    const reloaded = await EmailTemplate.findOne({ action: "order_cancelled" });
    expect(reloaded.subject).toBe("New Subject — {{order_id}}");
    expect(reloaded.updated_by.toString()).toBe(admin._id.toString());

    const audit = await AuditLog.findOne({ event: "EMAIL_TEMPLATE_UPDATED" });
    expect(audit).toBeTruthy();
    expect(audit.actor_id.toString()).toBe(admin._id.toString());
  });

  it("resetToDefault requires confirm:true and re-applies the code-owned default, discarding a customization", async () => {
    await seedTemplate({ subject: "Customized Subject", body: "<p>Customized</p>", required_variables: [] });
    const admin = await createAdmin();

    const reqNoConfirm = mockReq({ params: { action: "order_cancelled" }, body: {}, auth: { user_id: admin._id } });
    const resNoConfirm = mockRes();
    let caught;
    await resetToDefault(reqNoConfirm, resNoConfirm, (err) => {
      caught = err;
    });
    expect(caught).toBeTruthy();

    const reqConfirm = mockReq({ params: { action: "order_cancelled" }, body: { confirm: true }, auth: { user_id: admin._id } });
    const resConfirm = mockRes();
    await resetToDefault(reqConfirm, resConfirm, (err) => {
      throw err;
    });

    const reloaded = await EmailTemplate.findOne({ action: "order_cancelled" });
    expect(reloaded.subject).toBe("Order Cancelled — {{order_id}}");
    expect(reloaded.subject).not.toBe("Customized Subject");

    const audit = await AuditLog.findOne({ event: "EMAIL_TEMPLATE_RESET" });
    expect(audit).toBeTruthy();
  });

  it("preview renders with safe fixture data and never sends an email", async () => {
    await seedTemplate();
    const req = mockReq({ params: { action: "order_cancelled" }, body: {} });
    const res = mockRes();
    await preview(req, res, (err) => {
      throw err;
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.subject).toBe("Order Cancelled — ORD-DEMO-1001");
    expect(payload.data.missingVariables).toEqual([]);
    expect(emailCalls).toHaveLength(0);
  });

  it("preview renders unsaved draft content passed in the body, not the persisted row", async () => {
    await seedTemplate();
    const req = mockReq({
      params: { action: "order_cancelled" },
      body: { subject: "Draft Subject — {{order_id}}", body: "<p>Draft body</p>" },
    });
    const res = mockRes();
    await preview(req, res, (err) => {
      throw err;
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.subject).toBe("Draft Subject — ORD-DEMO-1001");
  });

  it("sendTest sends via emailService with only the fixed sample fixture, never real customer data, and audits it", async () => {
    await seedTemplate();
    const admin = await createAdmin();
    const req = mockReq({
      params: { action: "order_cancelled" },
      body: { email: "test-recipient@example.com" },
      auth: { user_id: admin._id },
    });
    const res = mockRes();
    await sendTest(req, res, (err) => {
      throw err;
    });

    expect(emailCalls).toHaveLength(1);
    const [to, type, , , substitutions] = emailCalls[0];
    expect(to).toBe("test-recipient@example.com");
    expect(type).toBe("order_cancelled");
    expect(substitutions.order_id).toBe("ORD-DEMO-1001"); // fixture, never a real order id

    const audit = await AuditLog.findOne({ event: "EMAIL_TEMPLATE_TEST_SENT" });
    expect(audit).toBeTruthy();
    expect(audit.metadata.sent_to_masked).not.toBe("test-recipient@example.com");
  });

  it("requirePermission blocks a role without email_template.manage (403)", () => {
    const middleware = requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE);
    const req = mockReq({ auth: { role: "staff" } });
    const res = mockRes();
    let caught;
    middleware(req, res, (err) => {
      caught = err;
    });
    expect(caught).toBeTruthy();
    expect(caught.statusCode ?? caught.status).toBe(403);
  });

  it("requirePermission allows superadmin and manager", () => {
    const middleware = requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE);
    for (const role of ["superadmin", "manager"]) {
      const req = mockReq({ auth: { role } });
      const res = mockRes();
      let called = false;
      middleware(req, res, (err) => {
        if (err) throw err;
        called = true;
      });
      expect(called).toBe(true);
    }
  });
});
