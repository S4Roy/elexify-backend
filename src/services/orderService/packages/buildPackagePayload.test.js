import { describe, expect, it } from "vitest";
import { buildPackagePayload, resolveBillingAddress, resolvePackageDims, calculatePackageWeight } from "./buildPackagePayload.js";

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

describe("Shiprocket COD charges", () => {
  const order = {
    payment_method: "cod", shipping: 314, cod_fee: 50, grand_total: 3114,
    order_items: [{ ...baseOrder.order_items[0], unit_price: 2750 }],
  };
  const payable = payload => payload.sub_total + payload.shipping_charges
    + payload.giftwrap_charges + payload.transaction_charges - payload.total_discount;

  it("includes the COD fee in shipping without inflating the product value or collection", () => {
    const payload = build(order);
    expect(payload.shipping_charges).toBe(364);
    expect(payload.sub_total).toBe(2750);
    expect(payable(payload)).toBe(3114);
  });

  it("preserves the remaining balance for partial COD without collecting the advance twice", () => {
    const payload = build({ ...order, is_partial_cod: true, advance_amount: 622.8, cod_due_amount: 2491.2 });
    expect(payload.shipping_charges).toBe(364);
    expect(payload.order_items[0].selling_price).toBe(2750);
    // Product total matches the items; the advance is the discount.
    expect(payload.sub_total).toBe(2750);
    expect(payload.total_discount).toBeCloseTo(622.8, 2);
    expect(payable(payload)).toBeCloseTo(2491.2, 2);
    expect(payload.comment).toContain("Partial COD: Rs 622.80 paid online");
  });

  it("matches the ORD-000107 partial COD shipment: items total, charges and the due amount", () => {
    const items = [
      ["a", 469, 4], ["b", 299, 1], ["c", 199, 2], ["d", 149, 2],
      ["e", 29, 1], ["f", 179, 1], ["g", 27, 2], ["h", 249, 1],
    ].map(([id, unit_price, quantity]) => ({ _id: id, display_name: id, sku: id, unit_price, quantity }));
    const payload = buildPackagePayload({
      order_data: {
        ...baseOrder, payment_method: "cod", note: "Checkout", order_items: items,
        shipping: 197, cod_fee: 50, grand_total: 3629,
        is_partial_cod: true, advance_amount: 725.8, cod_due_amount: 2903.2,
      },
      shiprocketConfig: { pickup_location: "Warehouse" },
      pkg: { package_number: 1, items: items.map((i) => ({ order_item_id: i._id, quantity: i.quantity })) },
      dims: { length: 10, width: 10, height: 10, weight: 2.65 },
    });
    const itemsTotal = payload.order_items.reduce((sum, i) => sum + i.selling_price * i.units, 0);
    expect(itemsTotal).toBe(3382);
    expect(payload.sub_total).toBe(3382);
    expect(payload.shipping_charges).toBe(247);
    expect(payload.total_discount).toBeCloseTo(725.8, 2);
    expect(payload.payment_method).toBe("COD");
    expect(payable(payload)).toBeCloseTo(2903.2, 2);
    expect(payload.comment).toBe("Checkout | Partial COD: Rs 725.80 paid online (shown as discount). Collect Rs 2903.20.");
  });

  it("splits a partial COD order across packages with each product total matching its items", () => {
    const items = [
      { _id: "x", display_name: "X", sku: "X", unit_price: 1000, quantity: 1 },
      { _id: "y", display_name: "Y", sku: "Y", unit_price: 500, quantity: 2 },
    ];
    const order_data = {
      ...baseOrder, payment_method: "cod", order_items: items, shipping: 100, cod_fee: 50, grand_total: 2150,
      is_partial_cod: true, advance_amount: 430, cod_due_amount: 1720,
    };
    const pkgBuild = (lines, n) => buildPackagePayload({
      order_data, shiprocketConfig: {}, pkg: { package_number: n, items: lines },
      dims: { length: 10, width: 10, height: 10, weight: 1 },
    });
    const p1 = pkgBuild([{ order_item_id: "x", quantity: 1 }], 1);
    const p2 = pkgBuild([{ order_item_id: "y", quantity: 2 }], 2);
    expect(p1.sub_total).toBe(1000);
    expect(p2.sub_total).toBe(1000);
    expect(payable(p1) + payable(p2)).toBeCloseTo(1720, 2);
    expect(p1.total_discount + p2.total_discount).toBeCloseTo(430, 2);
  });

  it("allocates shipping and the COD fee across split packages", () => {
    const order_data = { ...baseOrder, ...order,
      order_items: [{ ...order.order_items[0], quantity: 2 }], grand_total: 5864 };
    const first = build(order_data);
    const second = build(order_data);
    expect(first.shipping_charges).toBe(182);
    expect(first.shipping_charges + second.shipping_charges).toBe(364);
    expect(first.sub_total + second.sub_total).toBe(5500);
    expect(payable(first) + payable(second)).toBe(5864);
  });

  it("preserves prepaid amounts when there is no COD fee", () => {
    const payload = build({ ...order, payment_method: "razorpay", cod_fee: 0, grand_total: 3064 });
    expect(payload.shipping_charges).toBe(314);
    expect(payload.sub_total).toBe(2750);
    expect(payable(payload)).toBe(3064);
  });

  it("preserves order discounts and other charges", () => {
    const payload = build({ ...order, discount: 100, giftwrap_charges: 20,
      transaction_charges: 10, grand_total: 3044 });
    expect(payload.sub_total).toBe(2750);
    expect(payload.total_discount).toBe(100);
    expect(payable(payload)).toBe(3044);
  });
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

describe('physical package weight', () => {
  const packageOrderItems = [{ product: { weight: 2 }, quantity: 3 }, { product: { weight: 0.5 }, quantity: 4 }];
  it('sums product weight times the selected package quantity', () => {
    expect(resolvePackageDims({ qLength: 100, qWidth: 100, qHeight: 100, packageOrderItems }).weight).toBe(8);
  });
  it('uses the admin-entered package weight when given', () => {
    expect(resolvePackageDims({ qWeight: 3.7, packageOrderItems }).weight).toBe(3.7);
    expect(resolvePackageDims({ qWeight: 1.2, packageOrderItems: [{ product: {}, quantity: 1 }] }).weight).toBe(1.2);
  });
  it.each([-1, 'abc', 1001])('rejects an invalid admin-entered weight %s', qWeight => {
    expect(() => resolvePackageDims({ qWeight, packageOrderItems })).toThrow('Package weight');
  });
  it('uses variation weights and recalculates reduced quantities', () => {
    const item = { product: { weight: 2 }, variation: { weight: 0.5 }, quantity: 4 };
    expect(calculatePackageWeight([item])).toBe(2);
    expect(calculatePackageWeight([{ ...item, quantity: 1 }])).toBe(0.5);
    expect(calculatePackageWeight([])).toBe(0);
  });
  it.each([undefined, 0, -1, NaN])('rejects missing or invalid product weight %s', weight => {
    expect(() => calculatePackageWeight([{ product: { weight }, quantity: 1 }])).toThrow('positive product weight');
  });
});
