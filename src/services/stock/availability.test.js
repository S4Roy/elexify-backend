import { describe, expect, it } from "vitest";
import { availableOf, deriveStockStatus, isLowStock, isPurchasable } from "./availability.js";

describe("stock availability", () => {
  it("subtracts reserved units from on-hand", () => {
    expect(availableOf({ stock_quantity: 5, reserved_quantity: 2 })).toBe(3);
    expect(availableOf({ stock_quantity: 1, reserved_quantity: 4 })).toBe(0);
    expect(availableOf({ stock_quantity: 5 })).toBe(5);
  });

  it("treats unmanaged stock as unlimited", () => {
    expect(availableOf({ manage_stock: false, stock_quantity: 0 })).toBe(Infinity);
    expect(isPurchasable({ manage_stock: false, stock_quantity: 0 }, 99)).toBe(true);
  });

  it("honours backorders and inactive status", () => {
    expect(isPurchasable({ stock_quantity: 0, allow_backorders: true }, 3)).toBe(true);
    expect(isPurchasable({ stock_quantity: 0 }, 1)).toBe(false);
    expect(isPurchasable({ stock_quantity: 9, status: "inactive" }, 1)).toBe(false);
    expect(isPurchasable({ stock_quantity: 3, reserved_quantity: 1 }, 2)).toBe(true);
    expect(isPurchasable({ stock_quantity: 3, reserved_quantity: 2 }, 2)).toBe(false);
  });

  it("derives status", () => {
    expect(deriveStockStatus({ stock_quantity: 1 })).toBe("in_stock");
    expect(deriveStockStatus({ stock_quantity: 1, reserved_quantity: 1 })).toBe("out_of_stock");
    expect(deriveStockStatus({ stock_quantity: 0, allow_backorders: true })).toBe("on_backorder");
    expect(deriveStockStatus({ stock_quantity: 0, manage_stock: false })).toBe("in_stock");
  });

  it("uses the per-SKU low-stock threshold before the site one", () => {
    expect(isLowStock({ stock_quantity: 4 }, 5)).toBe(true);
    expect(isLowStock({ stock_quantity: 4, low_stock_threshold: 2 }, 5)).toBe(false);
    expect(isLowStock({ stock_quantity: 0, manage_stock: false }, 5)).toBe(false);
  });
});
