import { describe, expect, it } from "vitest";
import { renderEmailShell } from "./emailLayout.js";
import { emailBrand } from "../../config/emailBrand.js";
import { htmlToText } from "./htmlToText.js";

describe("renderEmailShell", () => {
  const base = { subject: "Order Confirmed", preheaderText: "We've received your order.", brand: emailBrand, contentHtml: "<p>Hello</p>" };

  it("includes the preheader, logo alt text, content, and footer links", () => {
    const html = renderEmailShell(base);
    expect(html).toContain("We&#x27;ve received your order.");
    expect(html).toContain(`alt="${emailBrand.brandName}"`);
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Terms &amp; Conditions");
  });

  it("omits the 'manage preferences' link by default (mandatory transactional template)", () => {
    const html = renderEmailShell(base);
    expect(html).not.toContain("Manage communication preferences");
  });

  it("includes the 'manage preferences' link when showPreferencesLink is true (marketing template)", () => {
    const html = renderEmailShell({ ...base, showPreferencesLink: true });
    expect(html).toContain("Manage communication preferences");
  });

  it("uses email-safe typography and a 600px max-width container", () => {
    const html = renderEmailShell(base);
    expect(html).toContain("Arial,Helvetica,sans-serif");
    expect(html).toContain("max-width:600px");
  });
});

describe("htmlToText", () => {
  it("strips tags, converts links to 'label (url)', and collapses blank lines", () => {
    const text = htmlToText('<p>Hi Test,</p><p>Your order <a href="https://x/1">ORD-1</a> shipped.</p>');
    expect(text).toContain("Hi Test,");
    expect(text).toContain("ORD-1 (https://x/1)");
    expect(text).not.toContain("<p>");
  });

  it("decodes common HTML entities", () => {
    expect(htmlToText("<p>Tom &amp; Jerry &middot; &nbsp;done&nbsp;</p>")).toContain("Tom & Jerry · done");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText(null)).toBe("");
  });
});
