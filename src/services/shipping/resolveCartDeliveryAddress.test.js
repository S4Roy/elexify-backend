import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../models/Address.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("./resolvePincode.js", () => ({ resolvePincode: vi.fn() }));
import Address from "../../models/Address.js";
import { resolvePincode } from "./resolvePincode.js";
import { resolveCartDeliveryAddress } from "./resolveCartDeliveryAddress.js";

describe("cart delivery address", () => {
  beforeEach(() => vi.clearAllMocks());
  it("lets guests estimate shipping using an active India pincode", async () => {
    vi.mocked(resolvePincode).mockResolvedValue({ serviceable: true, country: { id: 101 }, state: { id: 41 } });
    expect(await resolveCartDeliveryAddress({ postcode: "700001" })).toEqual({ postcode: "700001", country: 101, state: 41 });
    expect(Address.findOne).not.toHaveBeenCalled();
  });
  it.each([
    { serviceable: false },
    { serviceable: true, country: { id: 102 }, state: { id: 41 } },
    { serviceable: true, country: { id: 101 }, state: null },
  ])("does not quote an unsupported location: %j", async (location) => {
    vi.mocked(resolvePincode).mockResolvedValue(location);
    expect(await resolveCartDeliveryAddress({ postcode: "700001" })).toBeNull();
  });
  it("does not expose saved addresses to guests", async () => {
    expect(await resolveCartDeliveryAddress({ address_id: "address-1", postcode: "700001" })).toBeNull();
    expect(Address.findOne).not.toHaveBeenCalled();
  });
  it("uses the customer's saved address before a pincode estimate", async () => {
    const address = { postcode: "700001", country: 101, state: 41 };
    vi.mocked(Address.findOne).mockReturnValue({ lean: async () => address });
    expect(await resolveCartDeliveryAddress({ user_id: "user-1", address_id: "address-1", postcode: "700002" })).toEqual(address);
    expect(Address.findOne).toHaveBeenCalledWith({ _id: "address-1", deleted_at: null, user: "user-1" });
    expect(resolvePincode).not.toHaveBeenCalled();
  });
});
