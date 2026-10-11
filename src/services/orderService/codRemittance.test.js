import { beforeEach, describe, expect, it, vi } from "vitest";
import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { transitionOrder } from "./transitionOrder.js";
import { codSettlementOnDelivery, importCodRemittance, normalizeRemittanceRows } from "./codRemittance.js";

vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/Package.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("./transitionOrder.js", () => ({ transitionOrder: vi.fn() }));

const lean = (value) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });
const deliveredAt = new Date("2026-10-01T10:00:00Z");
const codOrder = (over = {}) => ({
  _id: "o1", id: "ORD-1", payment_method: "cod", payment_status: "paid", is_partial_cod: false,
  grand_total: 1200, cod_due_amount: 0, order_status: "delivered", delivered_at: deliveredAt,
  cod_remittance: { status: "awaiting", expected_amount: 1200, remitted_amount: 0, entries: [] }, ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("codSettlementOnDelivery", () => {
  it("marks full COD paid and awaiting remittance of the grand total", () => {
    const result = codSettlementOnDelivery(codOrder({ payment_status: "pending", cod_remittance: undefined }), deliveredAt);
    expect(result).toEqual({ paymentStatus: "paid", set: { paid_at: deliveredAt, cod_remittance: {
      status: "awaiting", expected_amount: 1200, remitted_amount: 0, entries: [], delivered_at: deliveredAt,
    } } });
  });

  it("expects only the balance for Partial COD", () => {
    const result = codSettlementOnDelivery(codOrder({ is_partial_cod: true, payment_status: "advance_paid", cod_due_amount: 900 }), deliveredAt);
    expect(result.set.cod_remittance.expected_amount).toBe(900);
  });

  it.each([
    ["prepaid", { payment_method: "razorpay", payment_status: "paid" }],
    ["already paid COD", { payment_status: "paid" }],
    ["Partial COD whose advance never cleared", { is_partial_cod: true, payment_status: "pending" }],
  ])("does nothing for %s", (_, over) => {
    expect(codSettlementOnDelivery(codOrder(over))).toBeNull();
  });
});

describe("normalizeRemittanceRows", () => {
  it("reads Shiprocket's column spellings, rupee amounts and DD-MM-YYYY dates", () => {
    const [line] = normalizeRemittanceRows([{ "AWB Code": " 123 ", "COD Amount": "₹1,200.00", "UTR No": "UTR9", "Remittance Date": "05-10-2026" }]);
    expect(line).toMatchObject({ row: 2, awb: "123", amount: 1200, utr: "UTR9" });
    expect(line.remitted_at.toISOString()).toBe("2026-10-04T18:30:00.000Z"); // 5 Oct, IST midnight
  });
});

describe("importCodRemittance", () => {
  const row = (over = {}) => ({ AWB: "AWB1", "COD Amount": "1200", UTR: "UTR1", "Remittance Date": "2026-10-05", ...over });

  it("previews without writing", async () => {
    Package.findOne.mockReturnValue(lean({ order_id: "o1" }));
    Order.findOne.mockResolvedValue(codOrder());
    const report = await importCodRemittance({ rows: [row()] });
    expect(report.results[0]).toMatchObject({ outcome: "ready", order_id: "ORD-1", expected_amount: 1200 });
    expect(report.recordable_amount).toBe(1200);
    expect(Order.updateOne).not.toHaveBeenCalled();
  });

  it("records the remittance once, keyed by AWB and UTR", async () => {
    Package.findOne.mockReturnValue(lean({ order_id: "o1" }));
    Order.findOne.mockResolvedValue(codOrder());
    await importCodRemittance({ rows: [row()], apply: true, adminId: "admin" });
    const [filter, update] = Order.updateOne.mock.calls[0];
    expect(filter["cod_remittance.entries.key"]).toEqual({ $nin: ["AWB1|UTR1"] });
    expect(update.$set).toMatchObject({ "cod_remittance.status": "remitted", "cod_remittance.remitted_amount": 1200, "cod_remittance.discrepancy": 0 });
    expect(update.$push["cod_remittance.entries"].$each[0]).toMatchObject({ awb: "AWB1", amount: 1200, utr: "UTR1" });
    expect(transitionOrder).not.toHaveBeenCalled();

    vi.clearAllMocks();
    Package.findOne.mockReturnValue(lean({ order_id: "o1" }));
    Order.findOne.mockResolvedValue(codOrder({ cod_remittance: { status: "remitted", expected_amount: 1200, remitted_amount: 1200,
      entries: [{ key: "AWB1|UTR1" }] } }));
    const again = await importCodRemittance({ rows: [row()], apply: true });
    expect(again.results[0].outcome).toBe("already_recorded");
    expect(Order.updateOne).not.toHaveBeenCalled();
  });

  it("flags a short remittance and keeps the order partially remitted", async () => {
    Package.findOne.mockReturnValue(lean({ order_id: "o1" }));
    Order.findOne.mockResolvedValue(codOrder());
    const report = await importCodRemittance({ rows: [row({ "COD Amount": "1100" })], apply: true });
    expect(report.results[0]).toMatchObject({ outcome: "short", discrepancy: -100 });
    expect(Order.updateOne.mock.calls[0][1].$set["cod_remittance.status"]).toBe("partially_remitted");
  });

  it("marks an older delivered COD order paid when its remittance arrives", async () => {
    Package.findOne.mockReturnValue(lean(null));
    Order.findOne.mockResolvedValue(codOrder({ payment_status: "pending", cod_remittance: undefined }));
    await importCodRemittance({ rows: [row()], apply: true });
    expect(transitionOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", paymentStatus: "paid", set: { paid_at: deliveredAt } }));
    expect(Order.updateOne.mock.calls[0][1].$set).toMatchObject({ "cod_remittance.delivered_at": deliveredAt, "cod_remittance.status": "remitted" });
  });

  it("matches by our order reference when the AWB is missing", async () => {
    Order.findOne.mockResolvedValue(codOrder());
    await importCodRemittance({ rows: [{ "Order ID": "ORD-1-P1", Amount: "1200", UTR: "U" }] });
    expect(Order.findOne).toHaveBeenCalledWith({ id: "ORD-1", deleted_at: null });
  });

  it.each([
    ["unmatched", null, "unmatched"],
    ["not COD", codOrder({ payment_method: "razorpay" }), "not_cod"],
    ["not delivered", codOrder({ order_status: "shipped" }), "not_delivered"],
    ["collected by our own rider", codOrder({ cod_collection: { amount: 1200 } }), "collected_in_store"],
  ])("skips %s rows", async (_, order, outcome) => {
    Package.findOne.mockReturnValue(lean(null));
    Order.findOne.mockResolvedValue(order);
    const report = await importCodRemittance({ rows: [row()], apply: true });
    expect(report.results[0].outcome).toBe(outcome);
    expect(Order.updateOne).not.toHaveBeenCalled();
  });

  it("reports a failed order without aborting the rest of the import", async () => {
    Package.findOne.mockReturnValueOnce(lean({ order_id: "o1" })).mockReturnValueOnce(lean({ order_id: "o2" }));
    Order.findOne.mockResolvedValueOnce(codOrder()).mockResolvedValueOnce(codOrder({ _id: "o2", id: "ORD-2" }));
    Order.updateOne.mockRejectedValueOnce(new Error("write failed")).mockResolvedValueOnce({});
    const report = await importCodRemittance({ rows: [row(), row({ AWB: "AWB2", UTR: "UTR2" })], apply: true });
    expect(report.results.map((r) => r.outcome)).toEqual(["failed", "ready"]);
  });
});
