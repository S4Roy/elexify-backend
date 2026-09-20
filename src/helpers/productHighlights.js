import sanitizeHtml from "sanitize-html";

// Imported catalog HTML may contain unclosed formatting tags. Normalize it
// before SSR so the browser cannot carry those tags into adjacent controls.
export function productHighlights(html) {
  if (typeof html !== "string" || !html.trim()) return null;
  return sanitizeHtml(html, {
    allowedTags: ["div", "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "span", "sub", "sup", "a"],
    allowedAttributes: { a: ["href", "title"] },
    // Paragraphs may contain phrasing content only. Use divs for legacy
    // paragraphs that contain lists or other paragraphs after parsing.
    transformTags: { p: "div" },
  }) || null;
}
