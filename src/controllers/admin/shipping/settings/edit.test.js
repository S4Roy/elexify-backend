import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../../models/ShippingSettings.js", () => ({ default: { getSingleton: vi.fn() } }));
vi.mock("../../../../services/index.js", () => ({ auditService: { recordAudit: vi.fn() } }));
vi.mock("../../../../config/index.js", () => ({ StatusError: { badRequest: message => new Error(message) } }));
import ShippingSettings from "../../../../models/ShippingSettings.js";
import { shippingSettingsSchema } from "../../../../validations/admin/shipping/settings/edit.js";
import { edit } from "./edit.js";
let settings, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  settings = { processing_days_min: 1, processing_days_max: 2, delivery_pickup_postcode: "", save: vi.fn() };
  ShippingSettings.getSingleton.mockResolvedValue(settings);
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
});
describe("admin delivery settings", () => {
  it("validates delivery controls and rejects unsafe calendars and unbounded days", () => {
    expect(shippingSettingsSchema.validate({ delivery_estimate_source: "shiprocket", delivery_pickup_postcode: "700001", delivery_buffer_days: 2 }).error).toBeUndefined();
    for (const invalid of [{ delivery_buffer_days: -1 }, { delivery_buffer_days: 0.5 }, { delivery_courier_policy: "random" },
      { delivery_pickup_postcode: "000000" }, { weekend_days: [0,1,2,3,4,5,6] }, { processing_days_min: 91 }]) {
      expect(shippingSettingsSchema.validate(invalid).error).toBeDefined();
    }
  });
  it("persists admin controls while preserving omitted settings", async () => {
    const body = { delivery_estimate_source: "shiprocket", delivery_pickup_postcode: "700001", delivery_courier_policy: "conservative", delivery_buffer_days: 2, delivery_fallback_enabled: false };
    await edit({ body, auth: { user_id: "admin" }, __: text => text }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(settings).toMatchObject({ ...body, processing_days_min: 1, processing_days_max: 2 });
    expect(settings.save).toHaveBeenCalledOnce();
  });
  it("checks partial updates against the persisted processing range", async () => {
    await edit({ body: { processing_days_min: 3 }, auth: { user_id: "admin" } }, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(settings.save).not.toHaveBeenCalled();
  });
  it("requires a pickup pincode when explicitly selecting live estimates", async () => {
    await edit({ body: { delivery_estimate_source: "shiprocket" }, auth: { user_id: "admin" } }, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(settings.save).not.toHaveBeenCalled();
  });
});
