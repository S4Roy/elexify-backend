import { describe, expect, it } from "vitest";
import { productHighlights } from "./productHighlights.js";

describe("product highlights HTML", () => {
  it("closes imported formatting tags before adjacent React controls", () => {
    expect(productHighlights("<strong>10nF capacitor")).toBe("<strong>10nF capacitor</strong>");
    expect(productHighlights("<div><strong>10nF</div>")).toBe("<div><strong>10nF</strong></div>");
  });

  it("keeps lists and inline formatting while normalizing paragraph containers", () => {
    expect(productHighlights("<p>Features<ul><li><b>100V</b></li></ul></p>"))
      .toBe("<div>Features</div><ul><li><b>100V</b></li></ul><div></div>");
  });

  it("preserves entities and safe links", () => {
    expect(productHighlights('<a href="/products">Parts &amp; accessories</a>'))
      .toBe('<a href="/products">Parts &amp; accessories</a>');
  });

  it("removes executable content", () => {
    expect(productHighlights('<script>alert(1)</script><b onclick="alert(1)">Safe</b>'))
      .toBe("<b>Safe</b>");
  });

  it("handles missing content and is stable when normalized again", () => {
    expect(productHighlights(null)).toBeNull();
    expect(productHighlights("")).toBeNull();
    const html = productHighlights("<p><strong>Capacitor");
    expect(productHighlights(html)).toBe(html);
  });
});
