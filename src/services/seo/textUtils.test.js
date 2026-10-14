import { expect, it } from "vitest";
import { toMetaText } from "./textUtils.js";

it("turns editor HTML into a clean meta description", () => {
  const html = '<p><span style="color:rgb(17, 24, 39);">·&nbsp;&nbsp;&nbsp; Power up your audio experience with this high-performance </span><strong><span style="color:rgb(17, 24, 39);">300W (100+100)</span></strong><span> stereo amplifier board &amp; more&#8230;</span></p>';
  expect(toMetaText(html, 160)).toBe("Power up your audio experience with this high-performance 300W (100+100) stereo amplifier board & more…");
});

it("separates paragraphs and line breaks as sentences", () => {
  expect(toMetaText("<p>Elexify 300W Board (NJW0281G &amp; NJW0302G)</p><p>Power up your audio.</p><ul><li>Low noise</li><li>Easy to fit</li></ul>", 160))
    .toBe("Elexify 300W Board (NJW0281G & NJW0302G). Power up your audio. Low noise. Easy to fit");
});

it("truncates at a word boundary and keeps plain text unchanged", () => {
  const long = "word ".repeat(50);
  const out = toMetaText(long, 160);
  expect(out.length).toBeLessThanOrEqual(160);
  expect(out.endsWith("word")).toBe(true);
  expect(toMetaText("Elexify 300W Stereo Amplifier Board", 60)).toBe("Elexify 300W Stereo Amplifier Board");
  expect(toMetaText(null, 60)).toBe("");
});
