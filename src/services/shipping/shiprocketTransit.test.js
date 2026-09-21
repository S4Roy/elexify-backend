import { describe, expect, it, vi } from "vitest";
vi.mock("../shiprocket/serviceability.js", () => ({ serviceability: vi.fn() }));
import { serviceability } from "../shiprocket/serviceability.js";
import { getShiprocketTransit, parseTransitDays, selectTransit } from "./shiprocketTransit.js";
const raw = { data: { recommended_courier_company_id: 2, available_courier_companies: [
  { courier_company_id: 1, estimated_delivery_days: "2", cod: 0 },
  { courier_company_id: 2, estimated_delivery_days: "3 - 4", cod: 1 },
  { courier_company_id: 3, estimated_delivery_days: "6", cod: 1 },
  { courier_company_id: 4, estimated_delivery_days: "1", cod: 1, blocked: 1 },
] } };
describe("Shiprocket transit", () => {
  it("parses documented day values and rejects dates/malformed or reversed ranges", () => {
    expect(parseTransitDays("4")).toEqual({ min: 4, max: 4 });
    expect(parseTransitDays("10 - 15")).toEqual({ min: 10, max: 15 });
    for (const value of [null, "", "Sep 22, 2026", "4-2", "-1", "0", "91", "2 days", "NaN"]) expect(parseTransitDays(value)).toBeNull();
  });
  it("selects recommended, fastest, or conservative service and filters blocked/COD-ineligible couriers", () => {
    expect(selectTransit(raw)).toMatchObject({ min: 3, max: 4 });
    expect(selectTransit(raw, "fastest")).toMatchObject({ min: 2, max: 2 });
    expect(selectTransit(raw, "fastest", true)).toMatchObject({ min: 3, max: 4 });
    expect(selectTransit(raw, "conservative")).toMatchObject({ min: 6, max: 6 });
    expect(selectTransit({ data: { ...raw.data, recommended_courier_company_id: 99 } })).toMatchObject({ min: 6, max: 6 });
  });
  it("distinguishes missing/invalid ETA from an explicitly empty courier list", () => {
    expect(selectTransit({})).toEqual({ status: "unavailable" });
    expect(selectTransit({ data: { available_courier_companies: [] } })).toEqual({ status: "unserviceable" });
    expect(selectTransit({ data: { available_courier_companies: [{ estimated_delivery_days: "" }] } })).toEqual({ status: "unavailable" });
  });
  it("coalesces and caches quotes without sharing across pincodes or payment modes", async () => {
    serviceability.mockResolvedValue({ success: true, raw });
    const args = { settings: { delivery_pickup_postcode: "700001", delivery_courier_policy: "recommended" }, postcode: "700160", weight: 2 };
    const results = await Promise.all([getShiprocketTransit(args), getShiprocketTransit(args)]);
    expect(results[0]).toEqual(results[1]);
    expect(serviceability).toHaveBeenCalledTimes(1);
    await getShiprocketTransit({ ...args, cod: true });
    await getShiprocketTransit({ ...args, postcode: "700161" });
    expect(serviceability).toHaveBeenCalledTimes(3);
    expect(serviceability).toHaveBeenCalledWith(expect.objectContaining({ weight_kg: 2, timeout_ms: 5000 }));
  });
  it("fails safely for missing pickup configuration and provider errors", async () => {
    expect(await getShiprocketTransit({ settings: {}, postcode: "700160" })).toEqual({ status: "unavailable" });
    serviceability.mockRejectedValue(new Error("timeout"));
    expect(await getShiprocketTransit({ settings: { delivery_pickup_postcode: "700002" }, postcode: "700160" })).toEqual({ status: "unavailable" });
  });
});
