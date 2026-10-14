const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Spaces, hyphens and underscores between words are interchangeable or optional,
// so "e cycle" also finds "e-cycle" and "ecycle". Dots and slashes stay literal
// because they carry meaning in sizes like 6.35mm and 1/4".
const SEPARATORS = /[\s_-]+/;
const FLEXIBLE_SEPARATOR = "[\\s_-]*";

// Builds the case-insensitive regex source matching any of the search terms.
export function searchPattern(terms) {
  const flexible = process.env.SEARCH_FLEXIBLE_SEPARATORS !== "false";
  return terms
    .map(term => {
      if (!flexible) return escapeRegex(term);
      const words = term.trim().split(SEPARATORS).filter(Boolean);
      return words.length ? words.map(escapeRegex).join(FLEXIBLE_SEPARATOR) : escapeRegex(term);
    })
    .join("|");
}
