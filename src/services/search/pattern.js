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

// Words that don't narrow a product search; dropped unless they're all there is.
const FILLER_WORDS = new Set(["a", "an", "and", "the", "for", "with", "of", "in", "to", "or"]);
const MAX_WORDS = 8;

// One regex per word, for matching every word of a search in any order:
// numbers are whole numbers ("12" matches "12-0-12" and "12V", not "120"),
// single letters stand alone ("v" matches "12V", not "valve"), and other words
// match from the start of a word ("speaker" finds "speakers").
export function wordPatterns(term) {
  const words = String(term ?? "").toLowerCase().split(/[^a-z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, "")).filter(Boolean);
  const meaningful = words.filter(word => !FILLER_WORDS.has(word));
  return [...new Set(meaningful.length ? meaningful : words)].slice(0, MAX_WORDS).map(word => {
    const escaped = escapeRegex(word);
    if (/^[0-9.]+$/.test(word)) return `(?<![0-9.])${escaped}(?![0-9])`;
    if (word.length === 1) return `(?<![a-z])${escaped}(?![a-z])`;
    return `(?<![a-z0-9])${escaped}`;
  });
}
