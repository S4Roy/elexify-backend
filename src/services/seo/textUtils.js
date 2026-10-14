// Truncate at the last whole-word boundary before maxLength — never cuts a
// word in half.
export const truncateAtWord = (text, maxLength) => {
  if (!text || text.length <= maxLength) return text || "";
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim();
};

export const collapseWhitespace = (text) =>
  (text || "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();

const NAMED_ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", zwnj: "" };

// Plain one-line text for meta title/description: strips HTML (editor markup
// pasted or copied from the product description), decodes entities, collapses
// whitespace and truncates at a word boundary.
export const toMetaText = (value, maxLength) => {
  const text = String(value ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Block boundaries (paragraphs, line breaks, list items, headings) become sentence breaks.
    .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[·•]\s*/g, " ");
  const sentences = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line, i, lines) => (i < lines.length - 1 && !/[.!?:;]$/.test(line) ? `${line}.` : line))
    .join(" ");
  return truncateAtWord(collapseWhitespace(sentences), maxLength);
};
