import { describe, expect, it, vi } from "vitest";
import { preview, update } from "./index.js";

// celebrate middleware calls next(err) on failure, next() on success —
// exercise it directly rather than trusting the controller-level tests
// (which call the controller function directly, bypassing this
// validation middleware entirely and so would never have caught this).
const runMiddleware = (middleware, body) =>
  new Promise((resolve) => {
    const req = { method: "POST", body, params: {}, query: {}, headers: {} };
    const res = {};
    middleware(req, res, (err) => resolve(err));
  });

describe("emailTemplate validations", () => {
  it("preview allows the full formGroup.getRawValue() payload the admin editor actually sends, including status", async () => {
    // Real bug: the Angular editor's refreshPreview() posts
    // subject/preheader/body/status (the whole reactive form), but the
    // schema only listed the first three — every preview call 400'd.
    const err = await runMiddleware(preview, {
      subject: "s",
      preheader: "p",
      body: "b",
      status: "active",
    });
    expect(err).toBeFalsy();
  });

  it("preview still allows the minimal subject/preheader/body-only payload", async () => {
    const err = await runMiddleware(preview, { subject: "s", preheader: "p", body: "b" });
    expect(err).toBeFalsy();
  });

  it("update rejects an unknown field (status is the only extra field allowed)", async () => {
    const err = await runMiddleware(update, {
      subject: "s",
      preheader: "p",
      body: "b",
      status: "active",
      required_variables: ["name"], // not editable via this endpoint
    });
    expect(err).toBeTruthy();
  });

  it("update requires subject and body", async () => {
    const err = await runMiddleware(update, { preheader: "p" });
    expect(err).toBeTruthy();
  });
});
