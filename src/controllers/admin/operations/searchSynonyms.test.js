import { beforeEach, expect, it, vi } from "vitest";
import SearchSynonym from "../../../models/SearchSynonym.js";
import { create, list, preview, remove, update } from "./searchSynonyms.js";
import { list as storefrontList } from "../../site/inventory/product/list.js";
vi.mock("../../site/inventory/product/list.js", () => ({ list: vi.fn() }));
vi.mock("../../../models/SearchSynonym.js", () => ({ default: {
  find: vi.fn(), countDocuments: vi.fn(), create: vi.fn(), findByIdAndUpdate: vi.fn(), findByIdAndDelete: vi.fn(), findOne: vi.fn(),
} }));
vi.mock("../../../models/SearchEvent.js", () => ({ default: {} }));
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const id = "65f000000000000000000001";

beforeEach(() => vi.clearAllMocks());

it("lists with an escaped term/alternative filter", async () => {
  const chain = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) };
  SearchSynonym.find.mockReturnValue(chain);
  SearchSynonym.countDocuments.mockResolvedValue(0);
  const res = response();
  await list({ query: { q: "Li.Ion", page: "2", limit: "10" } }, res, vi.fn());
  expect(SearchSynonym.find.mock.calls[0][0]).toEqual({ $or: [{ term: { $regex: "li\\.ion" } }, { alternatives: { $regex: "li\\.ion" } }] });
  expect(chain.skip).toHaveBeenCalledWith(10);
  expect(res.json.mock.calls[0][0].data).toMatchObject({ totalDocs: 0, page: 2, limit: 10 });
});

it("creates normalized synonyms and rejects invalid input", async () => {
  SearchSynonym.create.mockImplementation(async doc => doc);
  const res = response();
  await create({ body: { term: "Cuter", alternatives: ["Cutter"] } }, res, vi.fn());
  expect(SearchSynonym.create).toHaveBeenCalledWith({ term: "cuter", alternatives: ["cutter"] });
  expect(res.status).toHaveBeenCalledWith(201);
  const next = vi.fn();
  await create({ body: { term: "cuter", alternatives: [] } }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(400);
});

it("maps duplicate terms to 409 and unknown ids to 404", async () => {
  SearchSynonym.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));
  let next = vi.fn();
  await create({ body: { term: "cuter", alternatives: ["cutter"] } }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(409);
  SearchSynonym.findByIdAndUpdate.mockResolvedValue(null);
  next = vi.fn();
  await update({ params: { id }, body: { term: "cuter", alternatives: ["cutter"] } }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(404);
  next = vi.fn();
  await remove({ params: { id: "not-an-id" } }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(404);
  expect(SearchSynonym.findByIdAndDelete).not.toHaveBeenCalled();
});

it("previews exact storefront counts without recording shopper searches", async () => {
  storefrontList.mockImplementation(async (req, res) => {
    res.status(200).json({ data: { totalDocs: req.query.search_key === "lithium" ? 12 : 0 } });
  });
  const res = response();
  await preview({ body: { terms: ["Li Ion", "lithium", "li ion", ""] } }, res, vi.fn());
  expect(storefrontList).toHaveBeenCalledTimes(2);
  for (const [req] of storefrontList.mock.calls) {
    expect(req).toMatchObject({ skipSearchRecording: true, auth: null, query: { page: 1, limit: 1 } });
  }
  expect(res.json.mock.calls[0][0].data).toEqual([{ term: "li ion", count: 0 }, { term: "lithium", count: 12 }]);
  const next = vi.fn();
  await preview({ body: { terms: Array.from({ length: 12 }, (_, i) => `t${i}`) } }, response(), next);
  expect(next.mock.calls[0][0].statusCode).toBe(400);
});

it("passes exact through so the synonym editor sees uncorrected counts", async () => {
  storefrontList.mockReset();
  storefrontList.mockImplementation(async (req, res) => res.status(200).json({ data: { totalDocs: 1 } }));
  await preview({ body: { terms: ["cuter"], exact: true } }, response(), vi.fn());
  expect(storefrontList.mock.calls[0][0].query.exact).toBe("true");
  await preview({ body: { terms: ["cuter"] } }, response(), vi.fn());
  expect(storefrontList.mock.calls[1][0].query.exact).toBeUndefined();
});
