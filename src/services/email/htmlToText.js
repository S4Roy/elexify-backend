// Lightweight, dependency-free HTML→plain-text fallback for
// `mailOptions.text`. Not a full HTML parser — good enough for the
// simple, template-generated markup this codebase ever sends (no need for
// a full library here; the plain-text version only has to carry the same
// essential information, not pixel-perfect fidelity).
const ENTITIES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&middot;": "·",
  "&zwnj;": "",
};

const decodeEntities = (str) =>
  str.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&middot;|&zwnj;/g, (match) => ENTITIES[match]);

export const htmlToText = (html) => {
  if (!html) return "";

  let text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, (_, href, label) => `${label.trim()} (${href})`)
    .replace(/<\/(p|div|tr|table|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text);

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, idx, lines) => line !== "" || lines[idx - 1] !== "")
    .join("\n")
    .trim();
};
