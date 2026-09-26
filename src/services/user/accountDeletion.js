import { revokeAll } from '../customerSession/index.js';
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import ReturnRequest from "../../models/ReturnRequest.js";
import Address from "../../models/Address.js";
import Cart from "../../models/Cart.js";
import TempCart from "../../models/TempCart.js";
import Wishlist from "../../models/Wishlist.js";
import DeviceToken from "../../models/DeviceToken.js";
import PushNotification from "../../models/PushNotification.js";
import NotificationPreference from "../../models/NotificationPreference.js";
import Subscriber from "../../models/Subscriber.js";
import OtpVerification from "../../models/OtpVerification.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../constants/orderStatus.js";

// Customer self-service account deletion (Google Play / DPDP requirement).
//
// Deletion is immediate and irreversible once confirmed by OTP:
// - Personal data on the user record is erased and the account is closed,
//   so every existing session stops working (see isAccountClosed()).
// - Saved addresses, cart, wishlist, push devices, inbox, notification
//   preferences, newsletter subscription and pending OTPs are removed.
// - Orders, invoices, payments and returns are kept, as tax and accounting
//   law requires; addresses an order points at are soft-deleted with it.
// - Published reviews stay, shown under the anonymised name.
//
// It's refused while anything is still in progress (an undelivered order, an
// open return, a refund not yet completed) so the customer can't lose track
// of money or goods they're owed.

export const DELETION_REASONS = [
  "no_longer_needed",
  "another_account",
  "privacy",
  "too_many_messages",
  "bad_experience",
  "other",
];

export const DELETED_USER_NAME = "Deleted user";

// Orders in these statuses need nothing more from the customer. `pending`
// counts as settled: it's an unpaid checkout that never became an order.
const SETTLED_ORDER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
];
const OPEN_REFUND_STATUSES = [PAYMENT_STATUS.REFUND_PENDING, PAYMENT_STATUS.REFUND_FAILED];
const CLOSED_RETURN_STATUSES = ["rejected", "cancelled", "completed"];

/**
 * What stops this account from being deleted right now. Empty when it can go.
 * @returns {Promise<Array<{code: string, message: string, count: number}>>}
 */
export async function deletionBlockers(userId) {
  const [activeOrders, openRefunds, openReturns] = await Promise.all([
    Order.countDocuments({
      user: userId,
      order_status: { $nin: SETTLED_ORDER_STATUSES },
    }),
    Order.countDocuments({ user: userId, payment_status: { $in: OPEN_REFUND_STATUSES } }),
    ReturnRequest.countDocuments({
      customer_id: userId,
      status: { $nin: CLOSED_RETURN_STATUSES },
    }),
  ]);

  const blockers = [];
  if (activeOrders) {
    blockers.push({
      code: "ACTIVE_ORDERS",
      count: activeOrders,
      message: `${plural(activeOrders, "order is", "orders are")} still being processed or delivered. Wait until ${activeOrders === 1 ? "it's" : "they're"} delivered or cancel ${activeOrders === 1 ? "it" : "them"} first.`,
    });
  }
  if (openReturns) {
    blockers.push({
      code: "OPEN_RETURNS",
      count: openReturns,
      message: `${plural(openReturns, "return is", "returns are")} still open. Wait until ${openReturns === 1 ? "it's" : "they're"} completed or cancel ${openReturns === 1 ? "it" : "them"}.`,
    });
  }
  if (openRefunds) {
    blockers.push({
      code: "OPEN_REFUNDS",
      count: openRefunds,
      message: `${plural(openRefunds, "refund hasn't", "refunds haven't")} reached you yet. You can delete your account once ${openRefunds === 1 ? "it's" : "they're"} complete.`,
    });
  }
  return blockers;
}

function plural(n, one, many) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/**
 * Close the account and erase its personal data. Idempotent: returns false
 * if the account was already deleted.
 */
export async function deleteCustomerAccount({ userId, reason = null }) {
  const now = new Date();
  // Atomic claim: the user record is scrubbed first, in one update, so the
  // account is closed even if a later cleanup step fails.
  const before = await User.findOneAndUpdate(
    { _id: userId, deleted_at: null },
    {
      $set: {
        name: DELETED_USER_NAME,
        status: "inactive",
        deleted_at: now,
        deleted_by: userId,
        updated_at: now,
        updated_by: userId,
        // Rejects every token issued before now (resolveAuthorization and
        // isAccountClosed both honour it).
        password_changed_at: now,
        account_deletion: { reason, deleted_at: now },
        phone_code: null,
        mobile: null,
        pending_email: null,
        pending_mobile: null,
        pending_phone_code: null,
        address: null,
        password: null,
        profile_image: null,
        reset_token: null,
        google_id: null,
        dob: null,
        gender: null,
        email_verified_at: null,
        mobile_verified_at: null,
      },
      $unset: { email: "", gstin: "", legacy_import: "" },
    },
    { new: false, lean: true },
  );
  if (!before) return false;
  await revokeAll(userId, undefined, "ACCOUNT_DELETED");

  const identifiers = [
    before.email,
    before.pending_email,
    before.mobile && `${before.phone_code || "91"}${before.mobile}`,
    before.pending_mobile && `${before.pending_phone_code || "91"}${before.pending_mobile}`,
  ].filter(Boolean);
  const emails = [before.email, before.pending_email].filter(Boolean);

  const results = await Promise.allSettled([
    removeAddresses(userId, now),
    Cart.deleteMany({ user: userId }),
    TempCart.deleteMany({ user: userId }),
    Wishlist.deleteMany({ user: userId }),
    DeviceToken.deleteMany({ user_id: userId }),
    PushNotification.deleteMany({ user_id: userId }),
    NotificationPreference.deleteMany({ user_id: userId }),
    emails.length ? Subscriber.deleteMany({ email: { $in: emails } }) : null,
    identifiers.length ? OtpVerification.deleteMany({ identifier: { $in: identifiers } }) : null,
  ]);
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.error("account deletion cleanup failed:", userId, r.reason?.message));

  return true;
}

// Addresses an order points at are part of that order's record, so they're
// soft-deleted (hidden from the customer, kept for the invoice). The rest are
// removed outright.
async function removeAddresses(userId, now) {
  const [shipping, billing] = await Promise.all([
    Order.distinct("shipping_address", { user: userId }),
    Order.distinct("billing_address", { user: userId }),
  ]);
  const onOrders = [...shipping, ...billing].filter(Boolean);
  await Address.deleteMany({ user: userId, _id: { $nin: onOrders } });
  if (onOrders.length) {
    await Address.updateMany(
      { user: userId, _id: { $in: onOrders }, deleted_at: null },
      { $set: { deleted_at: now, is_default: false } },
    );
  }
}

/**
 * True when the token's account is gone: deleted, blocked, or the token
 * predates the latest credential change (which account deletion sets).
 * `iat` is the token's issued-at time in seconds.
 */
export async function isAccountClosed(userId, iat) {
  const user = await User.findById(userId, { deleted_at: 1, status: 1, password_changed_at: 1 }).lean();
  if (!user || user.deleted_at || user.status !== "active") return true;
  // Same rule as resolveAuthorization().
  return Boolean(
    user.password_changed_at &&
      iat <= Math.floor(new Date(user.password_changed_at).getTime() / 1000),
  );
}
