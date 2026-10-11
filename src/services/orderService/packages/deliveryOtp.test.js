import { beforeEach, describe, expect, it, vi } from "vitest";
import Address from "../../../models/Address.js";
import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import User from "../../../models/User.js";
import { sendSMS } from "../../sms/index.js";
import { getTemplate } from "../../smsTemplate/getTemplate.js";
import {
  OTP_MAX_FAILED, OTP_MAX_SENDS, deliveryOtpState, newDeliveryOtp, resendDeliveryOtp, sendDeliveryOtp, verifyDeliveryOtp,
} from "./deliveryOtp.js";

vi.mock("../../../models/Address.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../models/Package.js", () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../../models/User.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../sms/index.js", () => ({ sendSMS: vi.fn() }));
vi.mock("../../smsTemplate/getTemplate.js", () => ({ getTemplate: vi.fn() }));

const PKG_ID = "507f1f77bcf86cd799439022";
const RIDER = "507f1f77bcf86cd799439044";
const lean = (v) => ({ lean: () => Promise.resolve(v) });
const selectLean = (v) => ({ select: () => lean(v) });

const pkgWith = (otp, over = {}) => ({
  _id: PKG_ID, order_id: "o1", status: "out_for_delivery", fulfillment_mode: "self_delivery",
  delivery_agent: { user_id: RIDER }, delivery_otp: otp, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  getTemplate.mockResolvedValue({ dlt_message_id: "189215", variables: ["name", "purpose", "otp"] });
  sendSMS.mockResolvedValue({ success: true });
  Package.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("newDeliveryOtp", () => {
  it("makes a 4-digit code and stores only its hash", () => {
    const { code, record } = newDeliveryOtp(PKG_ID);
    expect(code).toMatch(/^\d{4}$/);
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(record)).not.toContain(`"${code}"`);
    expect(record).toMatchObject({ sent_count: 1, failed_attempts: 0 });
  });
});

describe("verifyDeliveryOtp", () => {
  const { code, record } = newDeliveryOtp(PKG_ID);

  it("accepts the right code", async () => {
    Package.findById.mockReturnValue(selectLean(pkgWith(record)));
    await expect(verifyDeliveryOtp({ packageId: PKG_ID, code, riderId: RIDER })).resolves.toBe(true);
    expect(Package.updateOne).not.toHaveBeenCalled();
  });

  it("counts a wrong code and says how many tries are left", async () => {
    Package.findById.mockReturnValue(selectLean(pkgWith(record)));
    const wrong = code === "0000" ? "1111" : "0000";
    await expect(verifyDeliveryOtp({ packageId: PKG_ID, code: wrong })).rejects.toThrow(`${OTP_MAX_FAILED - 1} tries left`);
    expect(Package.updateOne).toHaveBeenCalledWith({ _id: PKG_ID }, { $inc: { "delivery_otp.failed_attempts": 1 } });
  });

  it("stops accepting codes once locked, even the right one", async () => {
    Package.findById.mockReturnValue(selectLean(pkgWith({ ...record, failed_attempts: OTP_MAX_FAILED })));
    await expect(verifyDeliveryOtp({ packageId: PKG_ID, code })).rejects.toThrow(/Too many wrong codes/);
  });

  it("hides other riders' packages and refuses when no code was sent", async () => {
    Package.findById.mockReturnValue(selectLean(pkgWith(record)));
    await expect(verifyDeliveryOtp({ packageId: PKG_ID, code, riderId: "507f1f77bcf86cd799439099" })).rejects.toThrow(/Package not found/);
    Package.findById.mockReturnValue(selectLean(pkgWith(undefined)));
    await expect(verifyDeliveryOtp({ packageId: PKG_ID, code })).rejects.toThrow(/No delivery code/);
  });
});

describe("sendDeliveryOtp", () => {
  it("texts the delivery address phone through the generic OTP template", async () => {
    Address.findById.mockReturnValue(selectLean({ full_name: "Asha", phone_code: "91", phone: "98765 43210" }));
    const sent = await sendDeliveryOtp({ order: { shipping_address: "a1" }, mode: "store_pickup", code: "0042" });
    expect(sent).toBe(true);
    expect(sendSMS).toHaveBeenCalledWith({ to: "919876543210", message: "189215", variables: ["Asha", "Pickup", "0042"] });
  });

  it("falls back to the account mobile and never throws", async () => {
    Address.findById.mockReturnValue(selectLean({ full_name: "Asha", phone: "123" }));
    User.findById.mockReturnValue(selectLean({ name: "Asha R", phone_code: "91", mobile: "9123456780" }));
    await sendDeliveryOtp({ order: { shipping_address: "a1", user: "u1" }, mode: "self_delivery", code: "1234" });
    expect(sendSMS.mock.calls[0][0]).toMatchObject({ to: "919123456780", variables: ["Asha R", "Delivery", "1234"] });

    sendSMS.mockRejectedValue(new Error("network"));
    await expect(sendDeliveryOtp({ order: { user: "u1" }, mode: "self_delivery", code: "1234" })).resolves.toBe(false);
  });
});

describe("resendDeliveryOtp", () => {
  beforeEach(() => {
    Order.findOne.mockReturnValue(selectLean({ user: "u1" }));
    User.findById.mockReturnValue(selectLean({ name: "Asha", phone_code: "91", mobile: "9123456780" }));
  });

  it("issues a new code after the cooldown", async () => {
    const old = { ...newDeliveryOtp(PKG_ID).record, last_sent_at: new Date(Date.now() - 120_000) };
    Package.findById.mockReturnValue(selectLean(pkgWith(old)));
    await resendDeliveryOtp({ packageId: PKG_ID, riderId: RIDER });
    const [filter, update] = Package.updateOne.mock.calls[0];
    expect(filter).toMatchObject({ "delivery_otp.sent_count": 1 });
    expect(update.$set["delivery_otp.sent_count"]).toBe(2);
    expect(update.$set["delivery_otp.hash"]).not.toBe(old.hash);
    expect(sendSMS).toHaveBeenCalledTimes(1);
  });

  it("enforces the cooldown, the send limit and an open package", async () => {
    const rec = newDeliveryOtp(PKG_ID).record;
    Package.findById.mockReturnValue(selectLean(pkgWith({ ...rec, last_sent_at: new Date() })));
    await expect(resendDeliveryOtp({ packageId: PKG_ID })).rejects.toThrow(/Wait \d+ seconds/);
    Package.findById.mockReturnValue(selectLean(pkgWith({ ...rec, sent_count: OTP_MAX_SENDS, last_sent_at: new Date(0) })));
    await expect(resendDeliveryOtp({ packageId: PKG_ID })).rejects.toThrow(/too many times/);
    Package.findById.mockReturnValue(selectLean(pkgWith(rec, { status: "delivered" })));
    await expect(resendDeliveryOtp({ packageId: PKG_ID })).rejects.toThrow(/no longer awaiting/);
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe("deliveryOtpState", () => {
  it("never exposes the hash", () => {
    const state = deliveryOtpState(pkgWith({ hash: "secret", sent_count: OTP_MAX_SENDS, failed_attempts: 1 }));
    expect(state).toEqual({ sent: true, locked: false, can_resend: false });
  });
});
