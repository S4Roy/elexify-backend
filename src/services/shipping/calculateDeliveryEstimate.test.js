import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../models/ShippingSettings.js", () => ({ default: { getSingleton: vi.fn() } }));
vi.mock("./shiprocketTransit.js", () => ({ getShiprocketTransit: vi.fn() }));
import ShippingSettings from "../../models/ShippingSettings.js";
import { getShiprocketTransit } from "./shiprocketTransit.js";
import { calculateDeliveryEstimate } from "./calculateDeliveryEstimate.js";

const now = new Date("2026-09-21T06:00:00Z"); // Monday, 11:30 IST
const input = { postcode: "700160", weight: 2, min_delivery_days: 3, max_delivery_days: 5, now };
let settings;
beforeEach(() => {
  vi.clearAllMocks();
  settings = { delivery_estimate_source: "shiprocket", delivery_buffer_days: 1, delivery_fallback_enabled: true,
    processing_days_min: 1, processing_days_max: 2, exclude_weekends: true, weekend_days: [0], holidays: [] };
  ShippingSettings.getSingleton.mockImplementation(async () => settings);
  getShiprocketTransit.mockResolvedValue({ status: "ok", min: 2, max: 3 });
});
describe("delivery promises", () => {
  it("uses live transit with processing and buffer, even without a zone rate", async () => {
    const result = await calculateDeliveryEstimate({ ...input, min_delivery_days: null, max_delivery_days: null, cod: true });
    expect(result).toMatchObject({ source: "shiprocket", display: "24–27 Sep 2026", min_days: 3, max_days: 6, is_estimate: true });
    expect(getShiprocketTransit).toHaveBeenCalledWith(expect.objectContaining({ postcode: "700160", weight: 2, cod: true }));
  });
  it("applies cutoff in IST independent of host timezone", async () => {
    settings.order_cutoff_time = "12:00";
    const before = await calculateDeliveryEstimate({ ...input, now: new Date("2026-09-21T06:29:00Z") });
    const after = await calculateDeliveryEstimate({ ...input, now: new Date("2026-09-21T06:30:00Z") });
    expect(before.min_days).toBe(3);
    expect(after.min_days).toBe(4);
  });
  it("skips warehouse holidays and Sundays, but not courier transit Sundays", async () => {
    settings.processing_days_min = settings.processing_days_max = 0;
    settings.holidays = [new Date("2026-09-21T00:00:00Z")];
    const result = await calculateDeliveryEstimate({ ...input, now: new Date("2026-09-20T05:00:00Z") });
    expect(result.display).toBe("24–26 Sep 2026");
    settings.holidays = [];
    const saturday = await calculateDeliveryEstimate({ ...input, now: new Date("2026-09-26T05:00:00Z") });
    expect(saturday.display).toBe("28–30 Sep 2026");
  });
  it("falls back only on unavailable responses, never no-courier responses", async () => {
    getShiprocketTransit.mockResolvedValue({ status: "unavailable" });
    expect((await calculateDeliveryEstimate(input)).source).toBe("fallback");
    settings.delivery_fallback_enabled = false;
    expect(await calculateDeliveryEstimate(input)).toBeNull();
    settings.delivery_fallback_enabled = true;
    getShiprocketTransit.mockResolvedValue({ status: "unserviceable" });
    expect(await calculateDeliveryEstimate(input)).toBeNull();
  });
  it("does not call Shiprocket in manual mode or when stock is unavailable", async () => {
    expect(await calculateDeliveryEstimate({ ...input, isAvailable: false })).toBeNull();
    settings.delivery_estimate_source = "manual";
    expect((await calculateDeliveryEstimate(input)).source).toBe("manual");
    expect(getShiprocketTransit).not.toHaveBeenCalled();
  });
  it("rejects invalid legacy calendars and ranges without looping indefinitely", async () => {
    settings.weekend_days = [0, 1, 2, 3, 4, 5, 6];
    expect(await calculateDeliveryEstimate(input)).toBeNull();
    settings.weekend_days = [0];
    settings.processing_days_min = 4;
    expect(await calculateDeliveryEstimate(input)).toBeNull();
    settings.processing_days_min = 0;
    settings.delivery_estimate_source = "manual";
    expect(await calculateDeliveryEstimate({ ...input, max_delivery_days: 2 })).toBeNull();
  });
  it("does not send international postcodes to domestic Shiprocket serviceability", async () => {
    expect((await calculateDeliveryEstimate({ ...input, country: 231 })).source).toBe("fallback");
    expect(getShiprocketTransit).not.toHaveBeenCalled();
  });
  it("formats a cross-year window correctly", async () => {
    settings.processing_days_min = settings.processing_days_max = 0;
    const result = await calculateDeliveryEstimate({ ...input, now: new Date("2026-12-29T05:00:00Z") });
    expect(result.display).toBe("31 Dec 2026 – 2 Jan 2027");
  });
});
