import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../models/Order.js", () => ({ default: {
  findOneAndUpdate: vi.fn(), updateOne: vi.fn(), findById: vi.fn(),
} }));
vi.mock("../paymentService/refundRazorpayPayment.js", () => ({
  refundRazorpayPayment: vi.fn(), fetchRazorpayPayment: vi.fn(),
}));
vi.mock("../observability/recordOperationalEvent.js", () => ({ recordOperationalEvent: vi.fn() }));
vi.mock("../index.js", () => ({ notificationService: { sendOrderNotification: vi.fn() } }));
import Order from "../../models/Order.js";
import { refundRazorpayPayment, fetchRazorpayPayment } from "../paymentService/refundRazorpayPayment.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";
import { notificationService } from "../index.js";
import { attemptRefund } from "./attemptRefund.js";
const order = { _id: "order", id: "ORD-1", grand_total: 1000, payment_meta: { razorpay_payment_id: "pay_1" } };
beforeEach(() => {
  vi.clearAllMocks();
  Order.findOneAndUpdate.mockResolvedValue(order);
  Order.updateOne.mockResolvedValue({});
  Order.findById.mockResolvedValue(order);
  fetchRazorpayPayment.mockResolvedValue({ amount: 20000 });
  recordOperationalEvent.mockResolvedValue(undefined);
});
it("includes the captured refund amount in initiation and completion messages", async () => {
  refundRazorpayPayment.mockResolvedValue({ id: "rf_1", status: "processed", amount: 20000 });
  await attemptRefund(order);
  for (const event of ["REFUND_INITIATED", "REFUND_COMPLETED"]) {
    expect(notificationService.sendOrderNotification).toHaveBeenCalledWith(expect.objectContaining({
      event, data: { refund_amount: 200 },
    }));
  }
});
it("does not announce an initiated refund when the provider rejects it", async () => {
  refundRazorpayPayment.mockRejectedValue(new Error("Provider rejected refund"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await attemptRefund(order);
    expect(notificationService.sendOrderNotification).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
