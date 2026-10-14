import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import { normalizeQuery } from "../searchInsights/actions.js";

// Words customers can actually find: live product and category names. Rebuilt at most every 10 minutes.
const TTL_MS = 10 * 60_000;
const MAX_SUGGESTIONS = 6;
let vocabulary = null;
let loadedAt = 0;

const words = text => normalizeQuery(text).split(/[^a-z0-9]+/).filter(word => word.length >= 3 && !/^\d+$/.test(word));

async function loadVocabulary() {
  if (vocabulary && Date.now() - loadedAt < TTL_MS) return vocabulary;
  const [products, categories] = await Promise.all([
    Product.find({ deleted_at: null, status: "active" }, { name: 1 }).lean(),
    Category.find({ deleted_at: null, status: "active" }, { name: 1 }).lean(),
  ]);
  const counts = new Map();
  for (const { name } of [...products, ...categories]) {
    for (const word of new Set(words(name))) counts.set(word, (counts.get(word) || 0) + 1);
  }
  vocabulary = counts;
  loadedAt = Date.now();
  return vocabulary;
}

export function resetSuggestVocabulary() {
  vocabulary = null;
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
