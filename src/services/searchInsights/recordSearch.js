import SearchEvent from "../../models/SearchEvent.js";
import { logger } from "../../config/logger.js";

// Count first-page requests, including autocomplete, without storing customer identifiers.
export function recordSearch(query, page, resultCount) {
  if (typeof query !== "string" || Number(page) !== 1) return;
  const normalized = query.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
  if (!normalized || !Number.isFinite(resultCount) || resultCount < 0) return;
  try {
    Promise.resolve(SearchEvent.create({ query: normalized, result_count: resultCount }))
      .catch(() => logger.warn({ message: "Failed to record search insight" }));
  } catch {
    logger.warn({ message: "Failed to record search insight" });
  }
}
