import { describe, expect, it } from "vitest";
import { buildOrderMatchFilter } from "./buildOrderMatchFilter.js";

describe("buildOrderMatchFilter", () => {
  it("always excludes soft-deleted orders", () => {
    expect(buildOrderMatchFilter({}, { role: "superadmin" })).toEqual({ deleted_at: null });
  });

  it("scopes a customer-role caller to their own orders, ignoring customer_id", () => {
    const filter = buildOrderMatchFilter({ customer_id: "000000000000000000000001" }, { role: "customer", user_id: "000000000000000000000002" });
    expect(String(filter.user)).toBe("000000000000000000000002");
  });

  it("applies customer_id for an admin caller", () => {
    const filter = buildOrderMatchFilter({ customer_id: "000000000000000000000001" }, { role: "superadmin" });
    expect(String(filter.user)).toBe("000000000000000000000001");
  });

  it("splits comma-separated status/payment filters into $in", () => {
    const filter = buildOrderMatchFilter({
      order_status: "pending,confirmed",
      payment_status: "paid",
      payment_method: "cod,razorpay",
    }, { role: "superadmin" });
    expect(filter.order_status).toEqual({ $in: ["pending", "confirmed"] });
    expect(filter.payment_status).toEqual({ $in: ["paid"] });
    expect(filter.payment_method).toEqual({ $in: ["cod", "razorpay"] });
  });

  it("builds an inclusive date range, extending to_date through end of day", () => {
    const filter = buildOrderMatchFilter({ from_date: "2026-01-01", to_date: "2026-01-31" }, { role: "superadmin" });
    expect(filter.created_at.$gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filter.created_at.$lte.getHours()).toBe(23);
  });

  it("matches search_key against id, transaction_id, or order_status", () => {
    const filter = buildOrderMatchFilter({ search_key: "ORD-1" }, { role: "superadmin" });
    expect(filter.$or).toHaveLength(3);
  });

  it("rejects an invalid import_source", () => {
    expect(() => buildOrderMatchFilter({ import_source: "bogus" }, { role: "superadmin" })).toThrow("Invalid import source filter");
  });
});
