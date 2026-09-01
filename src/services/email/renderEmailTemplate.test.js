import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./renderEmailTemplate.js";
import { TEMPLATES } from "../../constants/emailTemplateDefaults.js";
import { emailBrand } from "../../config/emailBrand.js";

// Realistic fixture data covering every placeholder referenced across all
// 21 seeded templates, including the order-summary fields
// buildOrderEmailData.js produces and the optional/conditional ones
// (tracking_number, refund_amount, discount, coupon_code) so the full
// matrix renders end to end.
const FIXTURE_DATA = {
  name: "Subhankar Roy",
  order_id: "ORD-1787955890918",
  order_number: "ORD-1787955890918",
  order_date: "31 Aug 2026",
  payment_method_label: "Cash on Delivery",
  payment_status_label: "Paid",
  order_status_label: "Confirmed",
  is_cod: true,
  items: [{ product_name: "Wireless Mouse", variation_name: null, quantity: 2, unit_price: 499, total_price: 998 }],
  subtotal: 998,
  discount: 50,
  coupon_code: "SAVE50",
  shipping: 40,
  grand_total: 988,
  refund_amount: 988,
  shipping_address: {
    name: "Subhankar Roy",
    line1: "123 Main St",
    line2: null,
    city: "Kolkata",
    state: "WB",
    pincode: "700001",
    country: "India",
  },
  courier_name: "Delhivery",
  tracking_number: "TRK123",
  view_order_url: `${emailBrand.ordersUrl}/ORD-1787955890918`,
  account_url: emailBrand.accountUrl,
  storefront_url: emailBrand.storefrontUrl,
  otp: "123456",
  purpose: "login",
  expiry: 10,
  reset_link: "https://elexify.online/reset-password?token=abc123",
  new_email: "new@example.com",
};

// Minimal fixture — only the fields every order email is guaranteed to
// have, deliberately omitting every optional/conditional one
// (tracking_number, discount, coupon_code, refund_amount, shipping
// address) to prove those don't false-positive as "missing".
const MINIMAL_ORDER_FIXTURE = {
  name: "Test User",
  order_id: "ORD-1",
  order_number: "ORD-1",
  grand_total: 100,
  account_url: emailBrand.accountUrl,
  storefront_url: emailBrand.storefrontUrl,
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

  it("a template.required_variables entry missing from substitutions is flagged even if not referenced as a plain {{var}} (e.g. a partial hash-param)", () => {
    const { missingVariables } = renderEmailTemplate(
      { subject: "s", body: "b", required_variables: ["view_order_url"] },
      { name: "x" }
    );
    expect(missingVariables).toEqual(["view_order_url"]);
  });

  it("does NOT flag a variable only referenced inside a {{#if}} guard as missing — the block already guards its own absence", () => {
    const { missingVariables, body } = renderEmailTemplate(
      { subject: "s", body: "{{#if tracking_number}}Tracking: {{tracking_number}}{{/if}}" },
      { name: "x" } // tracking_number intentionally absent
    );
    expect(missingVariables).toEqual([]);
    expect(body).toBe(""); // the guarded block correctly renders nothing
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

  it("renders account_login (a template with no order-summary component) cleanly with the shared fixture", () => {
    const { missingVariables, unresolvedFields, subject, body } = renderEmailTemplate(
      TEMPLATES.account_login,
      FIXTURE_DATA
    );
    expect(missingVariables).toEqual([]);
    expect(unresolvedFields).toEqual([]);
    expect(subject).toBe("New login to your account");
    expect(body).toContain("Subhankar Roy");
  });

  it("renders every order/payment/refund template with only the guaranteed minimal fixture — optional fields never false-positive as missing", () => {
    const orderEvents = [
      "order_placed", "payment_success", "payment_failed", "order_processing",
      "order_shipped", "order_out_for_delivery", "order_delivered", "order_cancelled",
      "refund_initiated", "refund_completed",
    ];
    for (const action of orderEvents) {
      const { missingVariables, unresolvedFields } = renderEmailTemplate(TEMPLATES[action], MINIMAL_ORDER_FIXTURE);
      expect(missingVariables, `${action} missing with minimal fixture: ${missingVariables}`).toEqual([]);
      expect(unresolvedFields, `${action} unresolved with minimal fixture: ${unresolvedFields}`).toEqual([]);
    }
  });

  describe("every seeded EmailTemplate renders cleanly with the full fixture (21/21 audit)", () => {
    for (const [action, template] of Object.entries(TEMPLATES)) {
      it(`${action}: subject, preheader, and body resolve with no leftover {{...}}`, () => {
        const { subject, preheader, body, missingVariables, unresolvedFields } = renderEmailTemplate(
          template,
          FIXTURE_DATA
        );
        expect(missingVariables, `${action} missing variables: ${missingVariables}`).toEqual([]);
        expect(unresolvedFields, `${action} unresolved fields: ${unresolvedFields}`).toEqual([]);
        expect(subject.includes("{{")).toBe(false);
        expect(preheader.includes("{{")).toBe(false);
        expect(body.includes("{{")).toBe(false);
      });
    }
  });
});
