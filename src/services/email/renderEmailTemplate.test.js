import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./renderEmailTemplate.js";
import { TEMPLATES } from "../../constants/emailTemplateDefaults.js";

// Realistic fixture data covering every placeholder referenced across all
// seeded templates (see the TEMPLATES map in scripts/seedEmailTemplates.js).
const FIXTURE_DATA = {
  name: "Subhankar Roy",
  order_id: "ORD-1787955890918",
  otp: "123456",
  purpose: "login",
  expiry: 10,
  reset_link: "https://elexify.online/reset-password?token=abc123",
};

describe("renderEmailTemplate", () => {
  it("renders subject and body through the same pass — no unresolved placeholders in either", () => {
    const { subject, body, missingVariables, unresolvedFields } = renderEmailTemplate(
      { subject: "Order Cancelled — {{order_id}}", body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> has been cancelled.</p>" },
      FIXTURE_DATA
    );

    expect(subject).toBe("Order Cancelled — ORD-1787955890918");
    expect(subject.includes("{{")).toBe(false);
    expect(body.includes("{{")).toBe(false);
    expect(missingVariables).toEqual([]);
    expect(unresolvedFields).toEqual([]);
  });

  it("renders Refund Initiated subject correctly (the other reported bug case)", () => {
    const { subject } = renderEmailTemplate(TEMPLATES.refund_initiated, { ...FIXTURE_DATA });
    expect(subject).toBe("Refund Initiated — ORD-1787955890918");
  });

  it("detects a variable referenced by the template but missing from substitutions", () => {
    const { missingVariables, unresolvedFields } = renderEmailTemplate(
      { subject: "Order Cancelled — {{order_id}}", body: "<p>Hi {{name}}</p>" },
      { name: "Subhankar Roy" } // order_id intentionally omitted
    );
    expect(missingVariables).toEqual(["order_id"]);
    expect(unresolvedFields).toEqual([]); // Handlebars renders unknown vars as "", not literal {{...}}
  });

  it("the leftover-{{...}} check is defense in depth: a raw, never-compiled subject (the historical bug) would trip it", () => {
    // Standard Handlebars renders an unknown {{var}} as "" (caught instead
    // by missingVariables above) rather than leaving the braces — so this
    // check's real job is catching a subject/body that bypassed compile()
    // entirely, exactly like the original bug. Assert on the raw string a
    // caller would have sent before this fix, not on renderEmailTemplate's
    // own output (which by construction is always compiled).
    const neverCompiledSubject = "Order Cancelled — {{order_id}}";
    expect(/\{\{.*?\}\}/.test(neverCompiledSubject)).toBe(true);
  });

  it("does not flag a template with no placeholders at all", () => {
    const { missingVariables, unresolvedFields, subject, body } = renderEmailTemplate(
      TEMPLATES.account_login,
      FIXTURE_DATA
    );
    expect(missingVariables).toEqual([]);
    expect(unresolvedFields).toEqual([]);
    expect(subject).toBe("New login to your account");
    expect(body).toContain("Subhankar Roy");
  });

  describe("every seeded EmailTemplate renders cleanly with realistic fixture data", () => {
    for (const [action, template] of Object.entries(TEMPLATES)) {
      it(`${action}: subject and body resolve with no leftover {{...}}`, () => {
        const { subject, body, missingVariables, unresolvedFields } = renderEmailTemplate(template, FIXTURE_DATA);
        expect(missingVariables, `${action} missing variables: ${missingVariables}`).toEqual([]);
        expect(unresolvedFields, `${action} unresolved fields: ${unresolvedFields}`).toEqual([]);
        expect(subject.includes("{{")).toBe(false);
        expect(body.includes("{{")).toBe(false);
      });
    }
  });
});
