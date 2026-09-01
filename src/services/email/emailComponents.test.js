import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";
import "./emailComponents.js";

const render = (source, ctx = {}) => Handlebars.compile(source)(ctx);

describe("emailComponents partials", () => {
  it("statusBadge renders the label and defaults to the brand tone", () => {
    const html = render('{{> statusBadge label="Order Confirmed"}}', {});
    expect(html).toContain("Order Confirmed");
    expect(html).toContain("#eef2ff"); // brand tone badgeBg
  });

  it("statusBadge switches colors for the warn tone", () => {
    const html = render('{{> statusBadge label="Cancelled" tone="warn"}}', {});
    expect(html).toContain("#fffbeb"); // warn tone bg
  });

  it("ctaButton renders the url and text as given, HTML-escaping user data", () => {
    const html = render("{{> ctaButton url=url text=text}}", {
      url: "https://example.com/orders/1",
      text: 'View "Order"',
    });
    expect(html).toContain('href="https://example.com/orders/1"');
    expect(html).toContain("View &quot;Order&quot;");
  });

  it("addressBlock omits itself entirely when no address is given", () => {
    const html = render("{{> addressBlock heading=heading address=address}}", { heading: "Shipping" });
    expect(html.trim()).toBe("");
  });

  it("addressBlock renders the address fields when present", () => {
    const html = render("{{> addressBlock heading=heading address=address}}", {
      heading: "Shipping Address",
      address: { name: "Test User", line1: "1 Main St", city: "Kolkata", state: "WB", pincode: "700001", country: "India" },
    });
    expect(html).toContain("Shipping Address");
    expect(html).toContain("Test User");
    expect(html).toContain("1 Main St");
    expect(html).toContain("Kolkata");
  });

  it("otpCodeBlock renders the code", () => {
    const html = render("{{> otpCodeBlock code=code}}", { code: "654321" });
    expect(html).toContain("654321");
  });

  it("orderSummaryCard omits the item table when items is absent, but still shows totals", () => {
    const html = render("{{> orderSummaryCard}}", { order_number: "ORD-1", grand_total: 500 });
    expect(html).toContain("ORD-1");
    expect(html).toContain("₹500.00");
  });

  it("orderSummaryCard renders item rows and optional discount/shipping/refund lines when present", () => {
    const html = render("{{> orderSummaryCard}}", {
      order_number: "ORD-1",
      items: [{ product_name: "Mouse", quantity: 2, unit_price: 100, total_price: 200 }],
      subtotal: 200,
      discount: 20,
      coupon_code: "SAVE20",
      shipping: 40,
      grand_total: 220,
      refund_amount: 220,
    });
    expect(html).toContain("Mouse");
    expect(html).toContain("Qty: 2");
    expect(html).toContain("SAVE20");
    expect(html).toContain("Refund Amount");
  });

  it("currency helper formats numbers in en-IN with the rupee symbol", () => {
    const html = render("{{currency amount}}", { amount: 1575 });
    expect(html).toBe("₹1,575.00");
  });
});
