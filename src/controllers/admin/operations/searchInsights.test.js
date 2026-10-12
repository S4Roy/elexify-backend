import { expect, it, vi } from "vitest";
import SearchEvent from "../../../models/SearchEvent.js";
import { list } from "./searchInsights.js";
vi.mock("../../../models/SearchEvent.js", () => ({ default: { aggregate: vi.fn() } }));
it("returns grouped pagination and applies IST dates and no-result filtering", async () => {
  SearchEvent.aggregate.mockResolvedValue([{ summary: [{ searches: 8, zero_results: 3 }], queries: [{ docs: [{ _id: "cable", searches: 4, zero_results: 2 }], count: [{ total: 1 }] }] }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { from: "2026-10-12", to: "2026-10-12", zero_results: "true" } }, res, vi.fn());
  const pipeline = SearchEvent.aggregate.mock.calls.at(-1)[0];
  expect(pipeline[0].$match.created_at.$gte.toISOString()).toBe("2026-10-11T18:30:00.000Z");
  expect(pipeline[1].$facet.queries).toContainEqual({ $match: { zero_results: { $gt: 0 } } });
  expect(res.json.mock.calls[0][0].data).toMatchObject({ totalDocs: 1, summary: { searches: 8, zero_results: 3 } });
});
it("rejects invalid dates before querying storage", async () => {
  SearchEvent.aggregate.mockClear();
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { from: "2026-10-14", to: "2026-10-12" } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(SearchEvent.aggregate).not.toHaveBeenCalled();
});
