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
