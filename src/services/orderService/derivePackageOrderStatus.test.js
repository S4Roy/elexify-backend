import { describe, expect, it } from "vitest";
import { derivePackageOrderStatus, summarizePackageQuantities } from "./derivePackageOrderStatus.js";

const item = (overrides = {}) => ({ ordered_qty: 10, allocated_qty: 0, shipped_qty: 0, delivered_qty: 0, ...overrides });

describe("derivePackageOrderStatus", () => {
  it("returns null when nothing is packed yet", () => {
    expect(derivePackageOrderStatus([item()])).toBeNull();
  });

  it("returns packed once something is allocated but nothing has shipped", () => {
    expect(derivePackageOrderStatus([item({ allocated_qty: 10 })])).toBe("packed");
  });

  it("returns partially_shipped when only some items have shipped", () => {
    expect(
      derivePackageOrderStatus([
        item({ allocated_qty: 10, shipped_qty: 10 }),
        item({ allocated_qty: 10 }),
      ]),
    ).toBe("partially_shipped");
  });

  it("returns shipped once every item has shipped and nothing delivered", () => {
    expect(derivePackageOrderStatus([item({ allocated_qty: 10, shipped_qty: 10 })])).toBe("shipped");
  });

  it("returns partially_delivered when only some items have been delivered", () => {
    expect(
      derivePackageOrderStatus([
        item({ allocated_qty: 10, shipped_qty: 10, delivered_qty: 10 }),
        item({ allocated_qty: 10, shipped_qty: 10 }),
      ]),
    ).toBe("partially_delivered");
  });

  it("returns delivered once every item has been delivered", () => {
    expect(derivePackageOrderStatus([item({ allocated_qty: 10, shipped_qty: 10, delivered_qty: 10 })])).toBe(
      "delivered",
    );
  });

  it("reduces to single-package semantics: never a partial state for one package covering everything", () => {
    const singlePackageItems = [item({ allocated_qty: 10, shipped_qty: 10, delivered_qty: 0 })];
    expect(derivePackageOrderStatus(singlePackageItems)).toBe("shipped");
  });
});

describe("summarizePackageQuantities", () => {
  const orderItems = [
    { _id: "a", quantity: 5 },
    { _id: "b", quantity: 3 },
  ];

  it("excludes cancelled packages from allocation", () => {
    const packages = [
      { status: "cancelled", items: [{ order_item_id: "a", quantity: 5 }] },
      { status: "packed", items: [{ order_item_id: "b", quantity: 2 }] },
    ];
    const { items } = summarizePackageQuantities(orderItems, packages);
    const a = items.find((i) => i.order_item_id === "a");
    const b = items.find((i) => i.order_item_id === "b");
    expect(a.allocated_qty).toBe(0);
    expect(b.allocated_qty).toBe(2);
  });

  it("supports split quantities of the same SKU across multiple packages", () => {
    const packages = [
      { status: "shipped", items: [{ order_item_id: "a", quantity: 2 }] },
      { status: "packed", items: [{ order_item_id: "a", quantity: 3 }] },
    ];
    const { items } = summarizePackageQuantities(orderItems, packages);
    const a = items.find((i) => i.order_item_id === "a");
    expect(a.allocated_qty).toBe(5);
    expect(a.shipped_qty).toBe(2);
  });
});
