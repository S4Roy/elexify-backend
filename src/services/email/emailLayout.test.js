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
    expect(html).toContain('mailto:support@elexify.online');
    expect(html).toContain('Need help? <a href="mailto:support@elexify.online"');
  });

  it("omits the 'manage preferences' link by default (mandatory transactional template)", () => {
    const html = renderEmailShell(base);
    expect(html).not.toContain("Manage communication preferences");
  });

  it("includes the 'manage preferences' link when showPreferencesLink is true (marketing template)", () => {
    const html = renderEmailShell({ ...base, showPreferencesLink: true });
    expect(html).toContain("Manage communication preferences");
  });

  it("shows the app download section only for configured store links", () => {
    const html = renderEmailShell({ ...base, brand: { ...emailBrand, androidAppUrl: "https://play.google.com/store/apps/details?id=com.elexify" } });
    expect(html).toContain("Get the Elexify app");
    expect(html).toContain("Get it on Google Play");
    expect(html).not.toContain("Download on the App Store");
    expect(renderEmailShell(base)).not.toContain("Get the Elexify app");
  });

  it("renders configured social icons beside raster store badges", () => {
    const html = renderEmailShell({ ...base, brand: { ...emailBrand,
      androidAppUrl: 'https://play.google.com/store/apps/details?id=com.elexify',
      socialLinks: [{ label: 'Instagram', url: 'https://instagram.com/example', iconUrl: 'https://example.com/email/instagram.png' }] } });
    expect(html).toContain('Follow us'); expect(html).toContain('alt="Instagram"');
    expect(html).toContain('/email/google-play.png'); expect(html).toContain('border-right:1px solid');
    expect(html).not.toContain('Your next discovery, on the go');
  });

  it("keeps unsubscribe in the footer and never adds it to transactional messages", () => {
    const html = renderEmailShell({ ...base, isMarketing: true, unsubscribeUrl: "https://example.com/unsubscribe/token" });
    expect(html).toContain('href="https://example.com/unsubscribe/token"');
    expect(html).not.toContain("Preview only");
    expect(renderEmailShell(base)).not.toContain("Unsubscribe from newsletter emails");
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
