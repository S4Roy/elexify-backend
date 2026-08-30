import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { findByReceipt } = vi.hoisted(() => ({ findByReceipt: vi.fn() }));
vi.mock("../paymentService/createRazorpayOrder.js", () => ({
  findRazorpayOrderByReceipt: findByReceipt,
}));

import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import OperationalEvent from "../../models/OperationalEvent.js";
import { reconcileProviderOrderAttempt } from "../paymentService/reconcileProviderOrderAttempt.js";

const uri = process.env.TEST_MONGODB_URI?.replace("/elexify_integration?", "/elexify_provider_integration?");
const suite = uri ? describe : describe.skip;

suite("provider crash-window reconciliation", () => {
  beforeAll(() => mongoose.connect(uri, { autoIndex: false }));
  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await ProviderOrderAttempt.createCollection();
    await OperationalEvent.createCollection();
    await ProviderOrderAttempt.collection.createIndex({ user: 1, idempotency_key: 1 }, { unique: true });
    findByReceipt.mockReset();
  });
  afterAll(async () => {
    if (uri) { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); }
  });

  it("binds exactly one provider order recovered by deterministic receipt", async () => {
    const attempt = await ProviderOrderAttempt.create({
      user: new mongoose.Types.ObjectId(), idempotency_key: "crash-window-key-0001",
      request_fingerprint: "same-checkout", local_order_id: "ORD-CRASH-WINDOW",
      provider: "razorpay", amount: 250, currency: "INR", status: "creating",
      updated_at: new Date(Date.now() - 60_000),
    });
    findByReceipt.mockResolvedValue({
      id: "order_recovered_once", receipt: attempt.local_order_id, amount: 25000, currency: "INR",
    });
    await Promise.all([
      reconcileProviderOrderAttempt(attempt._id), reconcileProviderOrderAttempt(attempt._id),
    ]);
    const recovered = await ProviderOrderAttempt.findById(attempt._id);
    expect(recovered.provider_order_id).toBe("order_recovered_once");
    expect(recovered.status).toBe("reconciled");
    expect(recovered.reconciliation_attempts).toBe(1);
    expect(findByReceipt).toHaveBeenCalledTimes(1);
  });

  it("queues a missing provider order and never creates a replacement", async () => {
    const attempt = await ProviderOrderAttempt.create({
      user: new mongoose.Types.ObjectId(), idempotency_key: "crash-window-key-0002",
      request_fingerprint: "same-checkout", local_order_id: "ORD-CRASH-MISSING",
      provider: "razorpay", amount: 250, currency: "INR", status: "orphaned",
    });
    findByReceipt.mockResolvedValue(null);
    const result = await reconcileProviderOrderAttempt(attempt._id);
    expect(result.provider_order_id).toBeNull();
    expect(result.status).toBe("failed");
    expect(result.next_reconciliation_at).toBeTruthy();
    expect(await OperationalEvent.countDocuments({
      event_type: "provider_reconciliation_failed", correlation_id: attempt.local_order_id,
    })).toBe(1);
  });
});
