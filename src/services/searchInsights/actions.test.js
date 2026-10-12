import { describe, expect, it } from "vitest";
import { parseAction, sanitizeFilters } from "./actions.js";
const base = { event_id: "2cf75338-fc04-4f40-aecb-f82b65b57645", query: "  USB   Cable ", platform: "web", action: "submitted" };
it("normalizes query and keeps unconfirmed results unknown", () => {
  expect(parseAction(base)).toMatchObject({ query: "usb cable", event_type: "search", result_count: null });
});
it("rejects invalid result counts and unsupported events", () => {
  for (const value of [-1, null, undefined, "0", Infinity]) expect(parseAction({ ...base, action: "results_viewed", result_count: value })).toBeNull();
  expect(parseAction({ ...base, event_id: "invalid" })).toBeNull();
  expect(parseAction({ ...base, action: "keystroke" })).toBeNull();
});
it("requires a selected product and strips non-filter parameters", () => {
  expect(parseAction({ ...base, action: "suggestion_selected" })).toBeNull();
  expect(parseAction({ ...base, action: "suggestion_selected", product_id: "product-1" })).toMatchObject({ event_type: "suggestion", source: "suggestion" });
  expect(sanitizeFilters({ page: 2, search_key: "cable", category: "audio", sort_by: "price", price_min: 0, other: {}, constructor: "bad" })).toEqual({ category: "audio", price_min: "0" });
});
