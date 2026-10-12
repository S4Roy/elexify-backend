import { beforeEach, describe, expect, it, vi } from "vitest";
import User from "../../models/User.js";
import { reverseGeocodeLocation } from "./reverseGeocodeLocation.js";
import { distanceMetres, recordCustomerLocation, roundCoordinate } from "./customerLocation.js";

vi.mock("../../models/User.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./reverseGeocodeLocation.js", () => ({ reverseGeocodeLocation: vi.fn() }));

const USER = "507f1f77bcf86cd799439011";
const withUser = (last_location) => User.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: USER, last_location }) }) });
const kolkata = { resolved: { pincode: "700016", serviceable: true, city: { id: 5, name: "Kolkata" }, state: { id: 41, name: "West Bengal" } } };

beforeEach(() => vi.resetAllMocks());

describe("recordCustomerLocation", () => {
  it("stores the coordinates (6 decimals), accuracy, precise flag, GeoJSON point and area", async () => {
    withUser(undefined);
    reverseGeocodeLocation.mockResolvedValue(kolkata);
    const now = new Date("2026-10-12T10:00:00Z");
    const { location, updated } = await recordCustomerLocation({
      userId: USER, latitude: 22.54821349, longitude: 88.35198712, accuracy: 14.6, precise: true, now,
    });
    expect(updated).toBe(true);
    expect(reverseGeocodeLocation).toHaveBeenCalledWith(22.548213, 88.351987);
    expect(location).toEqual({ pincode: "700016", city: "Kolkata", city_id: 5, state: "West Bengal", state_id: 41,
      serviceable: true, latitude: 22.548213, longitude: 88.351987, accuracy_m: 15, precise: true,
      geo: { type: "Point", coordinates: [88.351987, 22.548213] }, recorded_at: now });
    expect(User.updateOne).toHaveBeenCalledWith({ _id: USER }, { $set: { last_location: location } });
  });

  it("skips a repeat within 6 hours unless the customer moved 100 m or more", async () => {
    const recorded_at = new Date("2026-10-12T08:00:00Z");
    const now = new Date("2026-10-12T10:00:00Z");
    withUser({ latitude: 22.548213, longitude: 88.351987, recorded_at, pincode: "700016" });
    // ~30 m away
    const { updated } = await recordCustomerLocation({ userId: USER, latitude: 22.5485, longitude: 88.352, now });
    expect(updated).toBe(false);
    expect(reverseGeocodeLocation).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();

    // ~1 km away
    reverseGeocodeLocation.mockResolvedValue(kolkata);
    const moved = await recordCustomerLocation({ userId: USER, latitude: 22.5572, longitude: 88.352, now });
    expect(moved.updated).toBe(true);
  });

  it("keeps the point when the geocoder is down, and rejects bad coordinates", async () => {
    withUser(undefined);
    reverseGeocodeLocation.mockResolvedValue(null);
    const { location } = await recordCustomerLocation({ userId: USER, latitude: 19.0761, longitude: 72.8775 });
    expect(location).toMatchObject({ pincode: null, city: null, latitude: 19.0761, longitude: 72.8775, accuracy_m: null, precise: null });
    await expect(recordCustomerLocation({ userId: USER, latitude: 123, longitude: 0 })).rejects.toThrow(/Invalid coordinates/);
    expect(roundCoordinate(1.23456789)).toBe(1.234568);
    expect(Math.round(distanceMetres({ latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 }))).toBe(111);
  });
});
