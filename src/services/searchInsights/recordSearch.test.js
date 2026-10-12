import { beforeEach, expect, it, vi } from "vitest";
import SearchEvent from "../../models/SearchEvent.js";
import { logger } from "../../config/logger.js";
import { recordSearch } from "./recordSearch.js";
vi.mock("../../models/SearchEvent.js", () => ({ default: { create: vi.fn() } }));
vi.mock("../../config/logger.js", () => ({ logger: { warn: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); SearchEvent.create.mockResolvedValue({}); });
it("records normalized queries with the full result count, including zero", () => {
  recordSearch("  USB   CABLE  ", "1", 0);
  expect(SearchEvent.create).toHaveBeenCalledWith({ query: "usb cable", result_count: 0 });
});
it("ignores pagination, blank queries and invalid result counts", () => {
  recordSearch("cable", 2, 0);
  recordSearch("   ", 1, 0);
  recordSearch(["cable"], 1, 0);
  recordSearch("cable", 1, undefined);
  expect(SearchEvent.create).not.toHaveBeenCalled();
});
it("does not let a storage failure break search", async () => {
  SearchEvent.create.mockRejectedValue(new Error("database unavailable"));
  expect(() => recordSearch("cable", 1, 3)).not.toThrow();
  await Promise.resolve();
  expect(logger.warn).toHaveBeenCalled();
});
