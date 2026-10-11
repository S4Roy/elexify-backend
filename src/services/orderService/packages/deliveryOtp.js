import crypto from "node:crypto";
import mongoose from "mongoose";
import Address from "../../../models/Address.js";
import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { normalizeMobile, DEFAULT_PHONE_CODE } from "../../../helpers/mobileHelper.js";
import { sendSMS } from "../../sms/index.js";
import { getTemplate } from "../../smsTemplate/getTemplate.js";

// Delivery code for own-rider / store-pickup handovers (Amazon/Flipkart
// style): a 4-digit code is texted to the customer when the parcel leaves
// (or is ready at the counter) and the rider types it in at the door, which
// marks proof_of_delivery.otp_verified. Optional by design — a rider can
// still deliver without it, the handover is just recorded as unverified.
//
// Sent through the already DLT-approved otp_generic template ("Your
// {purpose} OTP is {otp}"), so no new SMS registration is needed.

const CODE_LENGTH = 4;
export const OTP_MAX_FAILED = 5;
export const OTP_MAX_SENDS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

const PURPOSE = { self_delivery: "Delivery", store_pickup: "Pickup" };

// Keyed by package so the same code on two packages hashes differently.
const hashCode = (packageId, code) =>
  crypto.createHash("sha256").update(`${packageId}:${code}`).digest("hex");

const sameHash = (a, b) => a?.length === b?.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** New code plus the record stored on the package (only the hash is kept). */
export const newDeliveryOtp = (packageId, at = new Date()) => {
  const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  return { code, record: { hash: hashCode(String(packageId), code), sent_count: 1, last_sent_at: at, failed_attempts: 0 } };
};

// Customer's number for the handover: the delivery address phone (live,
// then snapshot), falling back to the account mobile.
const customerContact = async (order) => {
  const live = order.shipping_address ? await Address.findById(order.shipping_address).select("full_name phone phone_code").lean() : null;
  const candidates = [live, order.shipping_address_snapshot].filter(Boolean);
  for (const a of candidates) {
    const code = String(a.phone_code || DEFAULT_PHONE_CODE).replace(/\D/g, "");
    const mobile = normalizeMobile(a.phone, code);
    if (mobile) return { to: `${code}${mobile}`, name: a.full_name || "Customer" };
  }
  const user = order.user ? await User.findById(order.user).select("name phone_code mobile").lean() : null;
  const code = String(user?.phone_code || DEFAULT_PHONE_CODE).replace(/\D/g, "");
  const mobile = normalizeMobile(user?.mobile, code);
  return mobile ? { to: `${code}${mobile}`, name: user.name || "Customer" } : null;
};

/** Texts the code to the customer. Never throws; returns whether it went out. */
export const sendDeliveryOtp = async ({ order, mode, code }) => {
  try {
    const contact = await customerContact(order);
    if (!contact) return false;
    const template = await getTemplate("otp_generic");
    if (!template) return false;
    const values = { name: contact.name, purpose: PURPOSE[mode] || "Delivery", otp: code };
    const res = await sendSMS({
      to: contact.to,
      message: template.dlt_message_id,
      variables: template.variables.map((key) => values[key] ?? ""),
      ...(template.sender_id ? { sender_id: template.sender_id } : {}),
    });
    return !!res?.success;
  } catch (error) {
    console.error("Delivery OTP SMS failed:", error.message);
    return false;
  }
};

const ACTIVE = ["packed", "out_for_delivery"];

/**
 * Issues a fresh code (the old one stops working) and texts it again.
 * Limited to OTP_MAX_SENDS per package with a cooldown between sends.
 */
export const resendDeliveryOtp = async ({ packageId, riderId = null }) => {
  if (!mongoose.Types.ObjectId.isValid(packageId)) throw StatusError.notFound("Package not found");
  const pkg = await Package.findById(packageId).select("+delivery_otp order_id status fulfillment_mode delivery_agent").lean();
  if (!pkg || (riderId && String(pkg.delivery_agent?.user_id || "") !== String(riderId))) throw StatusError.notFound("Package not found");
  if (!PURPOSE[pkg.fulfillment_mode]) throw StatusError.conflict("Courier packages don't use a delivery code.");
  if (!ACTIVE.includes(pkg.status)) throw StatusError.conflict("This package is no longer awaiting handover.");

  const otp = pkg.delivery_otp || {};
  if ((otp.sent_count || 0) >= OTP_MAX_SENDS) throw StatusError.tooManyRequests("The code has been sent too many times. Deliver without it.");
  const wait = otp.last_sent_at ? OTP_RESEND_COOLDOWN_MS - (Date.now() - new Date(otp.last_sent_at).getTime()) : 0;
  if (wait > 0) throw StatusError.tooManyRequests(`Wait ${Math.ceil(wait / 1000)} seconds before sending the code again.`);

  const order = await Order.findOne({ _id: pkg.order_id, deleted_at: null }).select("user shipping_address shipping_address_snapshot").lean();
  if (!order) throw StatusError.notFound("Order not found");

  const { code, record } = newDeliveryOtp(pkg._id);
  // Guarded on the count we read, so two quick taps can't both send.
  const updated = await Package.updateOne(
    { _id: pkg._id, "delivery_otp.sent_count": otp.sent_count ?? { $exists: false } },
    { $set: {
      "delivery_otp.hash": record.hash,
      "delivery_otp.last_sent_at": record.last_sent_at,
      "delivery_otp.sent_count": (otp.sent_count || 0) + 1,
      "delivery_otp.failed_attempts": otp.failed_attempts || 0,
    } },
  );
  if (!updated.modifiedCount) throw StatusError.conflict("The code was just sent. Try again in a minute.");
  const sent = await sendDeliveryOtp({ order, mode: pkg.fulfillment_mode, code });
  if (!sent) throw StatusError.badRequest("Couldn't send the SMS. Deliver without the code.");
  return { sent };
};

/**
 * Checks a code the rider entered. Runs outside the delivery transaction
 * so a wrong guess is counted even though the delivery is rejected; after
 * OTP_MAX_FAILED wrong codes it stops accepting any.
 */
export const verifyDeliveryOtp = async ({ packageId, code, riderId = null }) => {
  if (!mongoose.Types.ObjectId.isValid(packageId)) throw StatusError.notFound("Package not found");
  const pkg = await Package.findById(packageId).select("+delivery_otp delivery_agent").lean();
  if (!pkg || (riderId && String(pkg.delivery_agent?.user_id || "") !== String(riderId))) throw StatusError.notFound("Package not found");
  const otp = pkg.delivery_otp;
  if (!otp?.hash) throw StatusError.badRequest("No delivery code was sent for this order. Deliver without it.");
  if ((otp.failed_attempts || 0) >= OTP_MAX_FAILED) {
    throw StatusError.badRequest("Too many wrong codes. Deliver without the code.");
  }
  if (sameHash(hashCode(String(pkg._id), String(code).trim()), otp.hash)) return true;

  await Package.updateOne({ _id: pkg._id }, { $inc: { "delivery_otp.failed_attempts": 1 } });
  const left = OTP_MAX_FAILED - (otp.failed_attempts || 0) - 1;
  throw StatusError.badRequest(left > 0
    ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.`
    : "Wrong code. The code is now locked; deliver without it.");
};

/** Safe-to-show state for rider/admin screens (never the hash). */
export const deliveryOtpState = (pkg) => {
  const otp = pkg?.delivery_otp;
  if (!otp?.hash) return { sent: false, locked: false, can_resend: true };
  return {
    sent: true,
    locked: (otp.failed_attempts || 0) >= OTP_MAX_FAILED,
    can_resend: (otp.sent_count || 0) < OTP_MAX_SENDS,
  };
};
