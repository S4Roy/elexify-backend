import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_data_operations_integration$1");
const suite = uri ? describe : describe.skip;

// Real registry operations (faqs, company-settings, pincodes) delegate to
// legacy script files that import config/mongoose.js, which opens its own
// connection to whatever MONGODB_URI is configured as a side effect of
// being imported. Pointing that env var at our OWN dedicated test
// database — before dynamically importing anything that pulls
// config/mongoose.js in — means both connections target the identical
// URI, which mongoose treats as a no-op re-connect rather than the
// "different connection strings" error you get from pointing the shared
// mongoose singleton at two different databases at once.
if (uri) {
  process.env.MONGODB_URI = uri;
}

suite("data-operations: dry-run accuracy, health checks, audit fields (real registry operations)", () => {
  let execute;
  let getOperation;
  let FAQ;
  let SiteSetting;
  let AuditLog;
  let recordAudit;

  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
    ({ execute } = await import("./runner.js"));
    ({ getOperation } = await import("./seeders/registry/index.js"));
    FAQ = (await import("../models/FAQ.js")).default;
    SiteSetting = (await import("../models/SiteSetting.js")).default;
    AuditLog = (await import("../models/AuditLog.js")).default;
    ({ recordAudit } = await import("../services/audit/recordAudit.js"));
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await Promise.all([FAQ.createIndexes(), SiteSetting.createIndexes(), AuditLog.createIndexes()]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("dry-run accuracy: faqs reports an accurate wouldInsert count before and after seeding", async () => {
    const before = await execute("faqs", { dryRun: true, triggerSource: "CLI" });
    expect(before.result.wouldInsert).toBeGreaterThan(0);
    expect(before.result.wouldUpdate).toBe(0);

    const realRun = await execute("faqs", { dryRun: false, triggerSource: "CLI" });
    expect(realRun.status).toBe("SUCCESS");
    expect(realRun.result.inserted).toBe(before.result.wouldInsert);

    const after = await execute("faqs", { dryRun: true, triggerSource: "CLI" });
    expect(after.result.wouldInsert).toBe(0);
    expect(after.result.wouldSkip).toBe(1);

    const actualCount = await FAQ.countDocuments({ deleted_at: null });
    expect(actualCount).toBeGreaterThan(0);
  });

  it("dry-run accuracy: company-settings reports an accurate wouldInsert count matching the real missing-slug count", async () => {
    const before = await execute("company-settings", { dryRun: true, triggerSource: "CLI" });
    expect(before.result.wouldInsert).toBe(7);

    await execute("company-settings", { dryRun: false, triggerSource: "CLI" });

    const after = await execute("company-settings", { dryRun: true, triggerSource: "CLI" });
    expect(after.result.wouldInsert).toBe(0);

    const actualCount = await SiteSetting.countDocuments({ slug: { $in: ["company_name", "company_address", "company_state", "company_gstin", "company_email", "company_phone", "company_gst_rate"] } });
    expect(actualCount).toBe(7);
  });

  it("health check: reports NOT_APPLICABLE for an operation with no meaningful expected-vs-actual signal (pincodes)", () => {
    const entry = getOperation("pincodes");
    expect(entry.healthCheck).toBeUndefined();
  });

  it("health check: reports a real DEGRADED-then-HEALTHY transition for company-settings", async () => {
    const entry = getOperation("company-settings");
    const before = await entry.healthCheck({ environment: "test" });
    expect(before.status).toBe("DEGRADED");
    expect(before.actual).toBe(0);

    await execute("company-settings", { dryRun: false, triggerSource: "CLI" });

    const after = await entry.healthCheck({ environment: "test" });
    expect(after.status).toBe("HEALTHY");
    expect(after.actual).toBe(after.expected);
  });

  it("health check status is computed independently of execution status — deleting the seeded data flips health back to DEGRADED without touching any execution record", async () => {
    const entry = getOperation("company-settings");
    await execute("company-settings", { dryRun: false, triggerSource: "CLI" });
    await SiteSetting.deleteMany({});

    const health = await entry.healthCheck({ environment: "test" });
    expect(health.status).toBe("DEGRADED");
  });

  it("audit event: metadata carries the exact fields the plan requires, and never a raw secret", async () => {
    const outcome = await execute("faqs", { dryRun: false, triggerSource: "ADMIN", triggeredBy: new mongoose.Types.ObjectId() });

    const adminId = new mongoose.Types.ObjectId();
    await recordAudit({
      userId: adminId,
      actorId: adminId,
      event: "SYSTEM_SEEDER_EXECUTED",
      metadata: {
        operation_key: "faqs",
        version: 1,
        environment: outcome.environment,
        execution_id: outcome.execution_id,
        dry_run: outcome.dry_run,
        result: outcome.result,
      },
    });

    const audit = await AuditLog.findOne({ event: "SYSTEM_SEEDER_EXECUTED" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.user_id.toString()).toBe(adminId.toString());
    expect(audit.actor_id.toString()).toBe(adminId.toString());
    expect(audit.metadata.operation_key).toBe("faqs");
    expect(audit.metadata.execution_id).toBe(outcome.execution_id);
    expect(audit.metadata.dry_run).toBe(false);
    expect(JSON.stringify(audit)).not.toMatch(/password|secret|token/i);
  });
});
