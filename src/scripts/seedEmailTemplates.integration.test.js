import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_seed_templates_integration$1"
);
const suite = uri ? describe : describe.skip;

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
