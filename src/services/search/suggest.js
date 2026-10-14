import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import SearchEvent from "../../models/SearchEvent.js";
import { normalizeQuery } from "../searchInsights/actions.js";

// Words customers can actually find: live product and category names. Rebuilt at most every 10 minutes.
const TTL_MS = 10 * 60_000;
const MAX_SUGGESTIONS = 6;
let vocabulary = null;
let loadedAt = 0;

const words = text => normalizeQuery(text).split(/[^a-z0-9]+/).filter(word => word.length >= 3 && !/^\d+$/.test(word));

// Phrases of 2-4 consecutive words in catalog names, for checking that an expanded
// form ("lithium ion") is really how products are listed.
let phrases = null;
const MAX_PHRASE_WORDS = 4;

async function loadVocabulary() {
  if (vocabulary && Date.now() - loadedAt < TTL_MS) return vocabulary;
  const [products, categories] = await Promise.all([
    Product.find({ deleted_at: null, status: "active" }, { name: 1 }).lean(),
    Category.find({ deleted_at: null, status: "active" }, { name: 1 }).lean(),
  ]);
  const counts = new Map();
  const phraseCounts = new Map();
  for (const { name } of [...products, ...categories]) {
    for (const word of new Set(words(name))) counts.set(word, (counts.get(word) || 0) + 1);
    const tokens = normalizeQuery(name).split(/[^a-z0-9]+/).filter(Boolean);
    const seen = new Set();
    for (let start = 0; start < tokens.length; start++) {
      for (let size = 2; size <= MAX_PHRASE_WORDS && start + size <= tokens.length; size++) seen.add(tokens.slice(start, start + size).join(" "));
    }
    for (const phrase of seen) phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
  }
  vocabulary = counts;
  phrases = phraseCounts;
  loadedAt = Date.now();
  return vocabulary;
}

export function resetSuggestVocabulary() {
  vocabulary = null;
  phrases = null;
}

// Optimal string alignment distance (adjacent swaps count as one edit), stopping early past `max`.
export function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

const allowedEdits = word => (word.length <= 4 ? 1 : 2);

// Close catalog words for a misspelled or unfamiliar word, best first (fewest edits, then most common).
function closeWords(word, vocab) {
  const max = allowedEdits(word);
  const found = [];
  for (const [candidate, count] of vocab) {
    if (candidate === word) continue;
    const distance = editDistance(word, candidate, max);
    if (distance <= max) found.push({ candidate, distance, count });
  }
  return found.sort((x, y) => x.distance - y.distance || y.count - x.count).map(item => item.candidate);
}

// Suggests alternatives for a synonym term by correcting words the catalog doesn't contain.
// "cuter" → "cutter"; "drone moter" → "drone motor". Words already in the catalog are kept.
export async function suggestAlternatives(term) {
  const query = normalizeQuery(term).slice(0, 100);
  const parts = query.split(/[\s_-]+/).filter(Boolean);
  if (!parts.length || parts.length > 6) return [];
  const vocab = await loadVocabulary();
  const suggestions = new Set();
  // Joined form first: "e cycle" → "ecycle" when the catalog spells it as one word.
  const joined = parts.join("");
  if (parts.length > 1 && vocab.has(joined)) suggestions.add(joined);
  parts.forEach((part, index) => {
    if (part.length < 3 || /^\d+$/.test(part) || vocab.has(part)) return;
    for (const candidate of closeWords(part, vocab).slice(0, 3)) {
      suggestions.add(parts.map((p, i) => (i === index ? candidate : p)).join(" "));
    }
  });
  suggestions.delete(query);
  return [...suggestions].slice(0, MAX_SUGGESTIONS);
}

const MAX_EXPANSIONS = 4;

// Catalog phrases a short word stands for: a prefix ("li" → "lithium") or the
// initials of consecutive words ("bms" → "battery management system").
function expansionsFor(token, vocab) {
  // Real catalog words ("ion", "kit") aren't abbreviations.
  if (!/^[a-z]{2,5}$/.test(token) || vocab.has(token)) return [];
  const found = new Set();
  for (const [word] of [...vocab].sort((a, b) => b[1] - a[1])) {
    if (word.length >= token.length + 2 && word.startsWith(token)) found.add(word);
  }
  if (token.length >= 3) {
    for (const [phrase] of [...phrases].sort((a, b) => b[1] - a[1])) {
      const parts = phrase.split(" ");
      if (parts.length === token.length && parts.every((part, i) => part[0] === token[i] && /^[a-z]{2,}$/.test(part))) found.add(phrase);
    }
  }
  return [...found].slice(0, MAX_EXPANSIONS);
}

// Full forms of abbreviated words in the term, kept only when the whole result
// appears in product or category names: "li ion" → "lithium ion".
export async function suggestFullForms(term) {
  const query = normalizeQuery(term).slice(0, 100);
  const parts = query.split(/[\s_-]+/).filter(Boolean);
  if (!parts.length || parts.length > MAX_PHRASE_WORDS) return [];
  const vocab = await loadVocabulary();
  const results = new Set();
  parts.forEach((part, index) => {
    for (const expansion of expansionsFor(part, vocab)) {
      const candidate = parts.map((p, i) => (i === index ? expansion : p)).join(" ");
      const known = candidate.includes(" ") ? phrases.has(candidate) : vocab.has(candidate);
      if (known && candidate !== query) results.add(candidate);
    }
  });
  return [...results].slice(0, MAX_SUGGESTIONS);
}

const MIN_SHARED_PICKS = 2;

// Other searches whose shoppers picked the same products as shoppers searching
// this term. Searches that only add or drop words ("li ion battery") are
// narrower or broader, not another name, so they're left out.
export async function suggestFromShoppers(term) {
  const query = normalizeQuery(term).slice(0, 100);
  if (!query) return [];
  const picked = await SearchEvent.distinct("product_id", { query, product_id: { $nin: [null, ""] } });
  if (!picked.length) return [];
  const rows = await SearchEvent.aggregate([
    { $match: { product_id: { $in: picked.slice(0, 200) }, query: { $ne: query } } },
    { $group: { _id: "$query", picks: { $sum: 1 }, products: { $addToSet: "$product_id" } } },
    { $match: { picks: { $gte: MIN_SHARED_PICKS } } },
    { $sort: { picks: -1, _id: 1 } },
    { $limit: 30 },
  ]);
  const termWords = new Set(query.split(/[\s_-]+/));
  return rows
    .map((row) => row._id)
    .filter((other) => {
      const otherWords = new Set(other.split(/[\s_-]+/));
      const contains = (a, b) => [...b].every((w) => a.has(w));
      return other.length >= 2 && !contains(otherWords, termWords) && !contains(termWords, otherWords);
    })
    .slice(0, MAX_SUGGESTIONS);
}

// All suggestion kinds for the synonym editor, each with why it was suggested.
export async function suggestAlternativeGroups(term) {
  const [spelling, fullForms, shoppers] = await Promise.all([
    suggestAlternatives(term),
    suggestFullForms(term),
    suggestFromShoppers(term).catch(() => []),
  ]);
  const seen = new Set([normalizeQuery(term)]);
  const out = [];
  for (const [reason, list] of [["spelling", spelling], ["full_form", fullForms], ["shoppers", shoppers]]) {
    for (const value of list) {
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ term: value, reason });
    }
  }
  return out;
}
