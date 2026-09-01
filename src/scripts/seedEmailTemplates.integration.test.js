import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_seed_templates_integration$1"
);
const suite = uri ? describe : describe.skip;

// The registry-path test below (further down) dynamically imports
// runner.js, which pulls in every registry operation — several of which
// delegate to legacy script files that import config/mongoose.js and
// connect as a side effect of that import. Pointing MONGODB_URI at this
// same dedicated test database first means that side-effect connection and
// this file's own mongoose.connect(uri) below target an identical
// connection string, which mongoose treats as a no-op rather than the
// "different connection strings" error you'd get pointing the shared
// mongoose singleton at two different databases at once.
if (uri) {
  process.env.MONGODB_URI = uri;
}

const EmailTemplate = (await import("../models/EmailTemplate.js")).default;

// Re-implements the script's upsert logic against the already-open test
// connection, rather than shelling out to the script (which opens its own
// connection via config/mongoose.js) — same $setOnInsert semantics.
const seedOnce = async () => {
  const { NOTIFICATION_EVENTS } = await import("../constants/notificationEvents.js");
  const ops = [
    { action: "otp", subject: "Your OTP Code", body: "<p>{{otp}}</p>" },
    ...Object.values(NOTIFICATION_EVENTS).map(({ templateKey }) => ({
      action: templateKey,
      subject: templateKey,
      body: `<p>${templateKey}</p>`,
    })),
  ].map(({ action, subject, body }) => ({
    updateOne: {
      filter: { action, site_language: "en" },
      update: { $setOnInsert: { action, site_language: "en", subject, body, status: "active", created_at: new Date() } },
      upsert: true,
    },
  }));
  return EmailTemplate.bulkWrite(ops, { ordered: false });
};

suite("seedEmailTemplates idempotency", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await EmailTemplate.createIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("creates templates on first run, and is a no-op on a second run", async () => {
    const first = await seedOnce();
    expect(first.upsertedCount).toBeGreaterThan(0);

    const countAfterFirst = await EmailTemplate.countDocuments();

    const second = await seedOnce();
    expect(second.upsertedCount).toBe(0);

    const countAfterSecond = await EmailTemplate.countDocuments();
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("never overwrites an admin-customized template on re-seed", async () => {
    await EmailTemplate.create({
      action: "otp",
      site_language: "en",
      subject: "CUSTOM SUBJECT — do not overwrite",
      body: "<p>Custom admin body</p>",
      status: "active",
    });

    await seedOnce();

    const reloaded = await EmailTemplate.findOne({ action: "otp", site_language: "en" });
    expect(reloaded.subject).toBe("CUSTOM SUBJECT — do not overwrite");
    expect(reloaded.body).toBe("<p>Custom admin body</p>");
  });
});

// Extends the idempotency coverage above to run through the actual
// data-operations registry + runner.execute() path (the same path both the
// admin panel and `npm run seed:email-templates` now use), not just a
// reimplementation of the raw upsert — proves the registry adapter in
// seeders/registry/operations/email-templates.js doesn't change the
// seeder's idempotency/customization-preservation guarantees.
suite("email-templates via the data-operations registry/runner", () => {
  let execute;

  beforeAll(async () => {
    ({ execute } = await import("./runner.js"));
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await EmailTemplate.createIndexes();
  });

  it("running the registered 'email-templates' operation twice creates templates once and is a no-op the second time", async () => {
    const first = await execute("email-templates", { dryRun: false, triggerSource: "CLI" });
    expect(first.status).toBe("SUCCESS");
    expect(first.result.inserted).toBeGreaterThan(0);

    const countAfterFirst = await EmailTemplate.countDocuments();

    const second = await execute("email-templates", { dryRun: false, triggerSource: "CLI" });
    expect(second.status).toBe("SUCCESS");
    expect(second.result.inserted).toBe(0);

    expect(await EmailTemplate.countDocuments()).toBe(countAfterFirst);
  });

  it("a customized template survives a re-run through the registry path, and the dry-run preview matches reality", async () => {
    await execute("email-templates", { dryRun: false, triggerSource: "CLI" });
    await EmailTemplate.updateOne(
      { action: "otp", site_language: "en" },
      { $set: { subject: "CUSTOM SUBJECT — registry path" } },
    );

    const preview = await execute("email-templates", { dryRun: true, triggerSource: "CLI" });
    expect(preview.result.wouldInsert).toBe(0);

    await execute("email-templates", { dryRun: false, triggerSource: "CLI" });

    const reloaded = await EmailTemplate.findOne({ action: "otp", site_language: "en" });
    expect(reloaded.subject).toBe("CUSTOM SUBJECT — registry path");
  });
});
