import SearchSynonym from "../../models/SearchSynonym.js";
import { logger } from "../../config/logger.js";
import { normalizeQuery } from "../searchInsights/actions.js";

export const MAX_ALTERNATIVES = 10;
export const MAX_TERM_LENGTH = 100;
// Each instance caches the table; edits reach other instances within the TTL.
const TTL_MS = 60_000;
let cache = null;
let loadedAt = 0;

export function invalidateSynonyms() {
  cache = null;
}

async function synonymMap() {
  if (!cache || Date.now() - loadedAt > TTL_MS) {
    const rows = await SearchSynonym.find({}, { term: 1, alternatives: 1 }).lean();
    cache = new Map(rows.map(row => [row.term, row.alternatives]));
    loadedAt = Date.now();
  }
  return cache;
}

// Returns the raw search key followed by any configured alternatives.
// Synonym lookup failures never break product search.
export async function searchTerms(searchKey) {
  const key = normalizeQuery(searchKey);
  if (!key) return [searchKey];
  try {
    return [searchKey, ...((await synonymMap()).get(key) || [])];
  } catch {
    logger.warn({ message: "Failed to load search synonyms" });
    return [searchKey];
  }
}

export function parseSynonym(body) {
  const term = normalizeQuery(body?.term);
  if (!term || term.length > MAX_TERM_LENGTH) return { error: "Term is required (max 100 characters)" };
  if (!Array.isArray(body?.alternatives)) return { error: "Alternatives must be a list" };
  const alternatives = [...new Set(body.alternatives.map(normalizeQuery))].filter(alt => alt && alt !== term);
  if (!alternatives.length) return { error: "Add at least one alternative that differs from the term" };
  if (alternatives.length > MAX_ALTERNATIVES) return { error: `At most ${MAX_ALTERNATIVES} alternatives` };
  if (alternatives.some(alt => alt.length > MAX_TERM_LENGTH)) return { error: "Alternatives are limited to 100 characters" };
  return { term, alternatives };
}
