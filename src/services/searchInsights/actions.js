import SearchEvent from "../../models/SearchEvent.js";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nonFilters = new Set(["page", "limit", "search_key", "sort_by", "sort_order", "currency"]);
export function normalizeQuery(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200) : "";
}
export function sanitizeFilters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, val]) =>
    /^[a-z][a-z0-9_\[\]-]{0,79}$/i.test(key) && !nonFilters.has(key) &&
    !["__proto__", "constructor", "prototype"].includes(key) &&
    ["string", "number", "boolean"].includes(typeof val) && String(val).length > 0
  ).slice(0, 25).map(([key, val]) => [key, String(val).slice(0, 300)]));
}
export function parseAction(body) {
  const query = normalizeQuery(body?.query);
  if (!query || typeof body?.event_id !== "string" || !UUID.test(body.event_id) ||
      !["submitted", "results_viewed", "suggestion_selected"].includes(body?.action) ||
      !["web", "mobile"].includes(body?.platform)) return null;
  if (body.action === "results_viewed" && (!Number.isSafeInteger(body.result_count) || body.result_count < 0)) return null;
  if (body.action === "suggestion_selected" && (typeof body.product_id !== "string" || !body.product_id || body.product_id.length > 100)) return null;
  const filters = sanitizeFilters(body.filters);
  return {
    event_id: body.event_id.toLowerCase(), query, platform: body.platform,
    event_type: body.action === "suggestion_selected" ? "suggestion" : "search",
    source: body.action === "suggestion_selected" ? "suggestion" : body.source === "results_url" ? "results_url" : "submitted",
    filters, filtered: Object.keys(filters).length > 0,
    result_count: body.action === "results_viewed" ? body.result_count : null,
    ...(body.action === "suggestion_selected" ? { product_id: body.product_id } : {}),
  };
}

// A UUID identifies one action, not one session or query. Results may arrive before submission.
export async function saveAction(entry, action) {
  await SearchEvent.init();
  const identity = { event_id: entry.event_id, query: entry.query, event_type: entry.event_type, platform: entry.platform };
  const flags = action === "submitted" ? { submitted: true }
    : action === "results_viewed" ? { results_viewed: true } : {};
  const insert = { ...entry };
  try {
    await SearchEvent.updateOne(identity, { $setOnInsert: insert, ...(Object.keys(flags).length ? { $set: flags } : {}) }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Concurrent insert/retry: the unique UUID index chooses one row.
    await SearchEvent.updateOne(identity, { $set: flags });
  }
  if (action === "results_viewed") {
    // First successful view owns the count and filter context. Later filters cannot overwrite it.
    await SearchEvent.updateOne({ ...identity, result_count: null }, { $set: {
      result_count: entry.result_count, filters: entry.filters, filtered: entry.filtered,
    } });
  }
}
