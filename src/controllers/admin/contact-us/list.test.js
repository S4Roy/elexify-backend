import { beforeEach, expect, it, vi } from "vitest";
import { list } from "./list.js";
import ContactUs from "../../../models/ContactUs.js";
vi.mock("../../../models/ContactUs.js", () => ({ default: { aggregate: vi.fn(), aggregatePaginate: vi.fn() } }));
vi.mock("../../../config/index.js", () => ({ envs: { pagination: { limit: 10 } }, StatusError: {} }));
vi.mock("../../../resources/ContactUsResource.js", () => ({ default: { collection: vi.fn(async docs => docs) } }));
beforeEach(() => {
  vi.clearAllMocks();
  ContactUs.aggregate.mockReturnValue({});
  ContactUs.aggregatePaginate.mockResolvedValue({ docs: [] });
});
it("searches customer contact and enquiry fields literally while preserving status filters", async () => {
  const req = { query: { search_key: 'a+b@example.com', status: 'pending,answered' }, params: {}, __: value => value };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await list(req, res, next);
  expect(next).not.toHaveBeenCalled();
  const match = ContactUs.aggregate.mock.calls[0][0][0].$match;
  expect(match).toMatchObject({ deleted_at: null, status: { $in: ['pending', 'answered'] } });
  expect(match.$or.map(entry => Object.keys(entry)[0])).toEqual(['name', 'email', 'phone', 'subject', 'message']);
  const search = new RegExp(match.$or[0].name.$regex, 'i');
  expect(search.test('a+b@example.com')).toBe(true);
  expect(search.test('ab@exampleXcom')).toBe(false);
});
