import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./resolveZone.js", () => ({ resolveZone: vi.fn() }));
vi.mock("../../models/ShippingRate.js", () => ({ default: { find: vi.fn() } }));

import ShippingRate from "../../models/ShippingRate.js";
import { resolveZone } from "./resolveZone.js";
import { calculateShippingRate } from "./calculateShippingRate.js";

describe("calculated shipping total", () => {
  beforeEach(() => {
    vi.mocked(resolveZone).mockResolvedValue({ _id: "zone-1", name: "Local" });
  });

  it("rounds once after adding all shipping classes", async () => {
    vi.mocked(ShippingRate.find).mockReturnValue({
      lean: async () => [
        { shipping_class: "small", flat_rate: 20.25, per_kg_rate: 0, min_delivery_days: 1, max_delivery_days: 2 },
        { shipping_class: "large", flat_rate: 20.25, per_kg_rate: 0, min_delivery_days: 2, max_delivery_days: 3 },
      ],
    });
    const result = await calculateShippingRate({
      items: [
        { shipping_class: "small", weight: 0, quantity: 1 },
        { shipping_class: "large", weight: 0, quantity: 1 },
      ],
    });
    expect(result.amount).toBe(41);
  });
});
