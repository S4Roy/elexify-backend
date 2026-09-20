import { describe, expect, it } from "vitest";
import { buildPackagePayload, resolveBillingAddress } from "./buildPackagePayload.js";

const baseOrder = {
  id: "ORD-123",
  created_at: "2026-09-19T08:00:00.000Z",
  payment_method: "razorpay",
  grand_total: 100,
  order_items: [{ _id: "item-1", display_name: "Part", sku: "P-1", quantity: 1, unit_price: 100 }],
};

const build = (order_data) => buildPackagePayload({
  order_data: { ...baseOrder, ...order_data },
  shiprocketConfig: { pickup_location: "Warehouse" },
  pkg: { package_number: 1, items: [{ order_item_id: "item-1", quantity: 1 }] },
  dims: { length: 10, width: 10, height: 10, weight: 0.5 },
});

describe("Shiprocket package address", () => {
  it("limits long shipping cities while retaining the full locality and existing address", () => {
    const city = "Greater Kailash Part Two Near Central Market New Delhi";
    const shipping_address = { address_line_1: "24 Main Road", address_line_2: "Floor 2", city_name: city, postcode: "110048" };
    const payload = build({
      billing_address: { address_line_1: "Billing Road", city_name: "Delhi", postcode: "110001" },
      shipping_address,
    });
    expect(payload.shipping_city).toBe(city.slice(0, 40).trimEnd());
    expect(payload.shipping_address_2).toBe(`Floor 2, ${city}`);
    expect(payload.shipping_address).toBe("24 Main Road");
    expect(shipping_address.city_name).toBe(city);
  });

  it("also limits billing snapshot cities when shipping uses billing", () => {
    const city = "A".repeat(41);
    const payload = build({ shipping_is_billing: true,
      billing_address_snapshot: { address_line_1: "Billing Road", city, postcode: "110001" },
    });
    expect(payload.billing_city).toBe("A".repeat(40));
    expect(payload.billing_address_2).toBe(city);
    expect(payload.shipping_is_billing).toBe(true);
    expect(payload.shipping_city).toBe("");
  });

  it("normalizes whitespace and leaves a city at the limit intact", () => {
    const city = "A".repeat(40);
    const payload = build({ billing_address: { address_line_1: "Road", city: { name: `  ${city}  ` }, postcode: "110001" } });
    expect(payload.billing_city).toBe(city);
    expect(payload.billing_address_2).toBe("");
  });

  it("uses an edited shipping address with a free-text city instead of the billing address", () => {
    const payload = build({
      billing_address: { address_line_1: "Original Billing Street", city_name: "Delhi", postcode: "110001" },
      shipping_address: { address_line_1: "Corrected Delivery Street", city: null, city_name: "Kolkata",
        state_name: "West Bengal", country_name: "India", postcode: "700001" },
    });
    expect(payload.shipping_is_billing).toBe(false);
    expect(payload.shipping_address).toBe("Corrected Delivery Street");
    expect(payload.shipping_city).toBe("Kolkata");
    expect(payload.billing_address).toBe("Original Billing Street");
  });
  it("uses the order-time billing snapshot when the live address is missing", () => {
    const payload = build({
      billing_address: null,
      billing_address_snapshot: {
        full_name: "Customer", address_line_1: "12 Market Road", city: "Kolkata",
        state: "West Bengal", country: "India", postcode: "700001", phone: "9876543210",
      },
    });

    expect(payload).toMatchObject({
      billing_address: "12 Market Road", billing_city: "Kolkata",
      billing_state: "West Bengal", billing_pincode: "700001", billing_phone: "9876543210",
    });
  });

  it("uses the shipping address when no billing address or snapshot exists", () => {
    const payload = build({
      shipping_address: {
        full_name: "Customer", address_line_1: "4 Station Road", city_name: "Delhi",
        state_name: "Delhi", postcode: "110001", phone: "9876543210",
      },
    });
    expect(payload.billing_address).toBe("4 Station Road");
    expect(payload.billing_city).toBe("Delhi");
    expect(resolveBillingAddress(baseOrder)).toBeNull();
  });
});
