import { expect, it, vi } from "vitest";
import SearchEvent from "../../../models/SearchEvent.js";
import { list, trend } from "./searchInsights.js";
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

it("sorts by whitelisted keys and falls back to search count", async () => {
  SearchEvent.aggregate.mockResolvedValue([{ summary: [], docs: [], count: [] }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { sort: "zero_rate" } }, res, vi.fn());
  let docs = SearchEvent.aggregate.mock.calls.at(-1)[0][2].$facet.docs;
  expect(docs.some(stage => stage.$addFields?.zero_rate)).toBe(true);
  expect(docs).toContainEqual({ $sort: { zero_rate: -1, zero_results: -1, _id: 1 } });
  await list({ query: { sort: "constructor" } }, res, vi.fn());
  docs = SearchEvent.aggregate.mock.calls.at(-1)[0][2].$facet.docs;
  expect(docs).toContainEqual({ $sort: { searches: -1, _id: 1 } });
  expect(res.json.mock.calls.at(-1)[0].data.sort).toBe("searches");
});

it("matches normalized query text with regex characters escaped", async () => {
  SearchEvent.aggregate.mockResolvedValue([{ summary: [], docs: [], count: [] }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: { q: "  LI.ion (18650)  " } }, res, vi.fn());
  const pipeline = SearchEvent.aggregate.mock.calls.at(-1)[0];
  expect(pipeline[0].$match.query).toEqual({ $regex: "li\\.ion \\(18650\\)" });
  expect(new RegExp(pipeline[0].$match.query.$regex).test("li.ion (18650) cell")).toBe(true);
  expect(new RegExp(pipeline[0].$match.query.$regex).test("lixion (18650)")).toBe(false);
});

it("summarises distinct and always-failing queries", async () => {
  SearchEvent.aggregate.mockResolvedValue([{ summary: [], docs: [], count: [] }]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: {} }, res, vi.fn());
  const summary = SearchEvent.aggregate.mock.calls.at(-1)[0][2].$facet.summary[0].$group;
  expect(summary.distinct_queries).toEqual({ $sum: 1 });
  expect(summary.failing_queries.$sum.$cond[0].$and).toHaveLength(2);
  expect(res.json.mock.calls[0][0].data.summary).toMatchObject({ distinct_queries: 0, failing_queries: 0 });
});

it("groups the trend by IST day and fills empty days in the requested range", async () => {
  SearchEvent.aggregate.mockResolvedValue([
    { _id: "2026-10-12", searches: 3, measured: 2, zero_results: 1 },
    { _id: "2026-10-14", searches: 5, measured: 5, zero_results: 0 },
  ]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await trend({ query: { from: "2026-10-11", to: "2026-10-14", platform: "web", q: "cell" } }, res, vi.fn());
  const pipeline = SearchEvent.aggregate.mock.calls.at(-1)[0];
  expect(pipeline[0].$match).toMatchObject({ event_type: "search", platform: "web", query: { $regex: "cell" } });
  expect(pipeline[1].$group._id.$dateToString.timezone).toBe("Asia/Kolkata");
  expect(res.json.mock.calls[0][0].data.days).toEqual([
    { date: "2026-10-11", searches: 0, measured: 0, zero_results: 0 },
    { date: "2026-10-12", searches: 3, measured: 2, zero_results: 1 },
    { date: "2026-10-13", searches: 0, measured: 0, zero_results: 0 },
    { date: "2026-10-14", searches: 5, measured: 5, zero_results: 0 },
  ]);
});

it("starts an open-ended trend at the first recorded day and rejects bad ranges", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-14T06:00:00.000Z"), toFake: ["Date"] });
  SearchEvent.aggregate.mockResolvedValue([{ _id: "2026-10-13", searches: 1, measured: 1, zero_results: 1 }]);
  let res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await trend({ query: {} }, res, vi.fn());
  expect(res.json.mock.calls[0][0].data.days.map(day => day.date)).toEqual(["2026-10-13", "2026-10-14"]);
  vi.useRealTimers();
  SearchEvent.aggregate.mockClear();
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await trend({ query: { from: "2026-10-14", to: "2026-10-12" } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(SearchEvent.aggregate).not.toHaveBeenCalled();
});
