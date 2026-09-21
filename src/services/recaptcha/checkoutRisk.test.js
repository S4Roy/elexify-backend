import { beforeEach, expect, it, vi } from "vitest";
import AbuseWindow from "../../models/AbuseWindow.js";
import { isSuspiciousCheckout } from "./checkoutRisk.js";
vi.mock("../../models/AbuseWindow.js", () => ({ default: { findOneAndUpdate: vi.fn() } }));
const config = { secret_key: "secret", checkoutAttempts: 5 };
beforeEach(() => vi.resetAllMocks());
it("uses a shared database counter and flags the configured threshold", async () => {
  AbuseWindow.findOneAndUpdate.mockResolvedValueOnce({ attempts: 4 }).mockResolvedValueOnce({ attempts: 5 });
  expect(await isSuspiciousCheckout({ ip: "203.0.113.1" }, config)).toBe(false);
  expect(await isSuspiciousCheckout({ ip: "203.0.113.1" }, config)).toBe(true);
  const [query, update, options] = AbuseWindow.findOneAndUpdate.mock.calls[0];
  expect(query._id).toMatch(/^checkout:\d+:[a-f0-9]{64}$/);
  expect(query._id).not.toContain("203.0.113.1");
  expect(update.$inc).toEqual({ attempts: 1 });
  expect(update.$setOnInsert.expires_at).toBeInstanceOf(Date);
  expect(options).toEqual({ upsert: true, new: true });
});
it("does not trust client guest identities or origin headers to bypass IP counters", async () => {
  AbuseWindow.findOneAndUpdate.mockResolvedValue({ attempts: 5 });
  for (const guest_id of ["a", "b"]) expect(await isSuspiciousCheckout({ ip: "203.0.113.1", auth: { guest_id }, headers: { origin: "native-app" } }, config)).toBe(true);
  expect(AbuseWindow.findOneAndUpdate.mock.calls[0][0]).toEqual(AbuseWindow.findOneAndUpdate.mock.calls[1][0]);
});
it("also checks the verified account counter", async () => {
  AbuseWindow.findOneAndUpdate.mockResolvedValueOnce({ attempts: 1 }).mockResolvedValueOnce({ attempts: 5 });
  expect(await isSuspiciousCheckout({ ip: "203.0.113.2", auth: { user_id: "user" } }, config)).toBe(true);
  expect(AbuseWindow.findOneAndUpdate).toHaveBeenCalledTimes(2);
});
it("retries concurrent counter creation conflicts without losing the attempt", async () => {
  AbuseWindow.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 }).mockResolvedValueOnce({ attempts: 5 });
  expect(await isSuspiciousCheckout({ ip: "203.0.113.1" }, config)).toBe(true);
  expect(AbuseWindow.findOneAndUpdate.mock.calls[1][2]).toEqual({ new: true });
});
