import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  terms: vi.fn(),
  pincodeLean: vi.fn(),
}));

vi.mock("./partialCodConsent.js", () => ({ getPartialCodTerms: mocks.terms }));

vi.mock("../../models/ShippingSettings.js", () => ({
  default: { getSingleton: mocks.settings },
}));
vi.mock("../../models/Pincode.js", () => ({
  default: {
    findOne: vi.fn(() => ({ select: () => ({ lean: mocks.pincodeLean }) })),
  },
}));

import { calculateCodEligibility } from "./calculateCodEligibility.js";

const baseSettings = {
  cod_enabled: true,
  cod_min_order: 500,
  cod_max_order: 10000,
  cod_charge_enabled: true,
  cod_charge: 49,
  cod_allowed_pincodes: [],
  cod_disallowed_pincodes: [],
  cod_disallowed_categories: [],
  cod_disallowed_brands: [],
  cod_disallowed_shipping_classes: [],
  cod_disallowed_zones: [],
  cod_allowed_customer_types: ["customer"],
};

describe("calculateCodEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.terms.mockResolvedValue({ required: true, available: true, version: "policy-version" });
    mocks.settings.mockResolvedValue({ ...baseSettings });
    mocks.pincodeLean.mockResolvedValue({ status: "active", cod_status: "use_global" });
  });

  it("returns the configured fee for an eligible order", async () => {
    const result = await calculateCodEligibility({
      items: [{ product: { cod_status: "use_global", categories: [] } }],
      address: { postcode: "700160" },
      orderAmount: 1200,
      user: { role: "customer" },
    });
    expect(result).toMatchObject({ eligible: true, fee: 49, reason: null, code: "ELIGIBLE" });
  });

  it.each([
    [true, true, true], [true, false, false], [false, true, false], [false, false, false],
  ])("exposes acceptance only for enabled Partial COD (%s / %s)", async (advance, consent, required) => {
    mocks.settings.mockResolvedValue({ ...baseSettings, cod_advance_enabled: advance, cod_consent_required: consent });
    const result = await calculateCodEligibility({ items: [], address: { postcode: "700160" }, orderAmount: 1000, user: { role: "customer" } });
    expect(result.consent).toEqual(required ? { required: true, available: true, version: "policy-version" } : null);
    expect(mocks.terms).toHaveBeenCalledTimes(required ? 1 : 0);
  });

  it("blocks an order above the maximum", async () => {
    const result = await calculateCodEligibility({
      items: [], address: { postcode: "700160" }, orderAmount: 10001, user: { role: "customer" },
    });
    expect(result.code).toBe("ABOVE_MAXIMUM");
  });

  it("blocks the whole order when one product is prepaid-only", async () => {
    const result = await calculateCodEligibility({
      items: [{ product: { prepaid_only: true, categories: [] } }],
      address: { postcode: "700160" }, orderAmount: 1000, user: { role: "customer" },
    });
    expect(result.code).toBe("PRODUCT_RESTRICTED");
  });

  it("keeps shipping and COD pincode rules separate", async () => {
    mocks.pincodeLean.mockResolvedValue({ status: "active", cod_status: "disallowed", note: "Prepaid only area" });
    const result = await calculateCodEligibility({
      items: [], address: { postcode: "700160" }, orderAmount: 1000, user: { role: "customer" },
    });
    expect(result).toMatchObject({ eligible: false, code: "PINCODE_RESTRICTED", reason: "Prepaid only area" });
  });
});
