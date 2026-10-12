import { expect, it, vi } from "vitest";
import SearchEvent from "../../../models/SearchEvent.js";
import { list } from "./searchInsights.js";
vi.mock("../../../models/SearchEvent.js", () => ({ default: { aggregate: vi.fn() } }));
it("returns grouped pagination and applies IST dates and no-result filtering", async () => {
  SearchEvent.aggregate.mockResolvedValue([{ summary: [{ searches: 8, zero_results: 3 }], docs: [{ _id: "cable", searches: 4, zero_results: 2 }], count: [{ total: 1 }] }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { from: "2026-10-12", to: "2026-10-12", zero_results: "true" } }, res, vi.fn());
  const pipeline = SearchEvent.aggregate.mock.calls.at(-1)[0];
  expect(pipeline[0].$match.created_at.$gte.toISOString()).toBe("2026-10-11T18:30:00.000Z");
  expect(pipeline[2].$facet.docs).toContainEqual({ $match: { zero_results: { $gt: 0 } } });
  expect(res.json.mock.calls[0][0].data).toMatchObject({ totalDocs: 1, summary: { searches: 8, zero_results: 3 } });
});
it("rejects invalid dates before querying storage", async () => {
  SearchEvent.aggregate.mockClear();
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { from: "2026-10-14", to: "2026-10-12" } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(SearchEvent.aggregate).not.toHaveBeenCalled();
});

it("uses a single top-level facet with matching filters for rows and count", async () => {
  SearchEvent.aggregate.mockResolvedValue([{ summary: [], docs: [], count: [] }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { zero_results: "true", page: "2", limit: "10" } }, res, vi.fn());
  const pipeline = SearchEvent.aggregate.mock.calls.at(-1)[0];
  const facets = pipeline.filter(stage => stage.$facet);
  expect(facets).toHaveLength(1);
  for (const branch of Object.values(facets[0].$facet)) {
    expect(branch.some(stage => stage.$facet)).toBe(false);
  }
  const { docs, count, summary } = facets[0].$facet;
  expect(docs[0]).toEqual(count[0]);
  expect(docs).toContainEqual({ $skip: 10 });
  expect(docs).toContainEqual({ $limit: 10 });
  expect(summary[0].$group.searches).toEqual({ $sum: "$searches" });
  expect(summary[0].$group.zero_results).toEqual({ $sum: "$zero_results" });
  expect(res.json.mock.calls[0][0].data).toMatchObject({ docs: [], totalDocs: 0, summary: { searches: 0, zero_results: 0, measured: 0 } });
});
