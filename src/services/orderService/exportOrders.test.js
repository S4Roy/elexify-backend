import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../models/Order.js", () => ({ default: { countDocuments: vi.fn(), aggregate: vi.fn() } }));

const { default: Order } = await import("../../models/Order.js");
const { buildOrdersExportWorkbook, ORDER_EXPORT_ROW_LIMIT } = await import("./exportOrders.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildOrdersExportWorkbook", () => {
  it("refuses to export when nothing matches the filter", async () => {
    Order.countDocuments.mockResolvedValue(0);
    await expect(buildOrdersExportWorkbook({ matchFilter: { deleted_at: null } })).rejects.toThrow("No orders match");
    expect(Order.aggregate).not.toHaveBeenCalled();
  });

  it("refuses an export over the row limit instead of truncating silently", async () => {
    Order.countDocuments.mockResolvedValue(ORDER_EXPORT_ROW_LIMIT + 1);
    await expect(buildOrdersExportWorkbook({ matchFilter: { deleted_at: null } })).rejects.toThrow(`over the ${ORDER_EXPORT_ROW_LIMIT} limit`);
    expect(Order.aggregate).not.toHaveBeenCalled();
  });

  it("scopes the count and the fetch to the given order_ids, in addition to the base filter", async () => {
    Order.countDocuments.mockResolvedValue(1);
    Order.aggregate.mockResolvedValue([{ id: "ORD-1", grand_total: 500, currency: "INR" }]);

    await buildOrdersExportWorkbook({ matchFilter: { deleted_at: null }, orderIds: ["ORD-1"] });

    expect(Order.countDocuments).toHaveBeenCalledWith({ deleted_at: null, id: { $in: ["ORD-1"] } });
    const pipeline = Order.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { deleted_at: null, id: { $in: ["ORD-1"] } } });
  });

  it("builds a workbook with a header row and one row per order", async () => {
    Order.countDocuments.mockResolvedValue(2);
    Order.aggregate.mockResolvedValue([
      { id: "ORD-1", created_at: new Date("2026-01-01"), customer_name: "Alice", customer_email: "a@x.com", customer_phone: "1", order_status: "delivered", payment_status: "paid", payment_method: "cod", total_items: 2, grand_total: 500, currency: "INR", shiprocket_order_id: "999", imported_from_backup: false },
      { id: "ORD-2", created_at: new Date("2026-01-02"), customer_name: null, customer_email: null, customer_phone: null, order_status: "pending", payment_status: "pending", payment_method: "razorpay", total_items: 1, grand_total: 250, currency: "INR", shiprocket_order_id: null, imported_from_backup: true },
    ]);

    const { workbook, count } = await buildOrdersExportWorkbook({ matchFilter: { deleted_at: null } });

    expect(count).toBe(2);
    const sheet = workbook.getWorksheet("Orders");
    expect(sheet.getRow(1).getCell(1).value).toBe("Order ID");
    expect(sheet.getRow(1).font.bold).toBe(true);
    expect(sheet.getRow(2).getCell(1).value).toBe("ORD-1");
    expect(sheet.getRow(3).getCell(3).value).toBe("Unnamed customer");
    expect(sheet.getRow(3).getCell(13).value).toBe("Yes");
  });
});
