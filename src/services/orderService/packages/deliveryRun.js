import crypto from "node:crypto";
import mongoose from "mongoose";
import Address from "../../../models/Address.js";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import User from "../../../models/User.js";
import Role from "../../../models/Role.js";
import { envs, StatusError } from "../../../config/index.js";
import { PERMISSIONS } from "../../../constants/adminPermissions.js";
import { s3Client } from "../../awsService/awsConfig.js";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { codAmountDue, staffName } from "./manualFulfillment.js";
import { deliveryOtpState } from "./deliveryOtp.js";

// What an own-delivery rider (delivery.run) sees: only packages assigned to
// them, with just enough customer data to complete the handover — name,
// phone, address and the COD amount to collect. Nothing else about the
// customer or other orders.

const DONE_WINDOW_MS = 24 * 3600_000;
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const addressLines = (a) => (a ? {
  name: a.full_name || null,
  phone: [a.phone_code ? `+${String(a.phone_code).replace(/^\+/, "")}` : null, a.phone].filter(Boolean).join(" ") || null,
  line1: a.address_line_1 || null,
  line2: a.address_line_2 || null,
  landmark: a.land_mark || null,
  city: a.city_name || null,
  state: a.state_name || null,
  postcode: a.postcode || null,
  latitude: a.latitude ?? null,
  longitude: a.longitude ?? null,
} : null);

/** Active staff with the Delivery Staff permission, for the dispatch picker. */
export const listDeliveryStaff = async () => {
  const roles = await Role.find({ status: "active", deleted_at: null, permissions: PERMISSIONS.DELIVERY_RUN }).select("_id").lean();
  if (!roles.length) return [];
  const users = await User.find({ admin_role_id: { $in: roles.map((r) => r._id) }, status: "active", deleted_at: null })
    .select("_id name first_name last_name mobile").sort({ name: 1 }).lean();
  return users.map((u) => ({ _id: u._id, name: staffName(u) || "Unnamed staff", mobile: u.mobile || null }));
};

/** The rider's open deliveries, plus what they completed in the last 24h. */
export const listMyDeliveries = async (riderId) => {
  const since = new Date(Date.now() - DONE_WINDOW_MS);
  const packages = await Package.find({
    "delivery_agent.user_id": new mongoose.Types.ObjectId(String(riderId)),
    fulfillment_mode: "self_delivery",
    $or: [{ status: "out_for_delivery" }, { status: "delivered", delivered_at: { $gte: since } }],
  }).select("+delivery_otp").sort({ shipped_at: 1 }).lean();
  if (!packages.length) return { open: [], done: [] };

  const orderIds = packages.map((p) => p.order_id);
  const [orders, items] = await Promise.all([
    Order.find({ _id: { $in: orderIds }, deleted_at: null })
      .select("id user shipping_address shipping_address_snapshot payment_method payment_status is_partial_cod grand_total cod_due_amount currency note")
      .lean(),
    OrderItem.find({ order_id: { $in: orderIds } }).select("order_id product_name variation_name quantity").lean(),
  ]);
  const addresses = await Address.find({ _id: { $in: orders.map((o) => o.shipping_address).filter(Boolean) } }).lean();
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  const addressById = new Map(addresses.map((a) => [String(a._id), a]));

  const cards = packages.map((pkg) => {
    const order = orderById.get(String(pkg.order_id));
    if (!order) return null;
    const lines = new Map(pkg.items.map((l) => [String(l.order_item_id), l.quantity]));
    return {
      package_id: pkg._id,
      order_number: order.id,
      status: pkg.status,
      dispatched_at: pkg.shipped_at || null,
      delivered_at: pkg.delivered_at || null,
      address: addressLines(addressById.get(String(order.shipping_address)) || order.shipping_address_snapshot),
      items: items.filter((i) => lines.has(String(i._id)))
        .map((i) => ({ name: [i.product_name, i.variation_name].filter(Boolean).join(" · "), quantity: lines.get(String(i._id)) })),
      cod_due: pkg.status === "delivered" ? 0 : codAmountDue(order),
      currency: order.currency || "INR",
      note: order.note || null,
      attempts: (pkg.delivery_attempts || []).map((a) => ({ at: a.at, reason: a.reason })),
      received_by: pkg.proof_of_delivery?.receiver_name || null,
      otp: deliveryOtpState(pkg),
      otp_verified: !!pkg.proof_of_delivery?.otp_verified,
    };
  }).filter(Boolean);
  return { open: cards.filter((c) => c.status !== "delivered"), done: cards.filter((c) => c.status === "delivered") };
};

/**
 * Stores a proof-of-delivery photo privately (no public-read ACL, unlike
 * media library uploads) and returns its key for markManualDelivered.
 */
export const uploadProofPhoto = async ({ packageId, file }) => {
  if (!file) return null;
  const ext = PHOTO_TYPES[file.mimetype];
  if (!ext) throw StatusError.badRequest("Proof photo must be a JPEG, PNG, WebP or HEIC image.");
  if (file.truncated || file.size > PHOTO_MAX_BYTES) throw StatusError.badRequest("Proof photo must be 8 MB or smaller.");
  const key = `delivery-proof/${packageId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: envs.s3.BUCKET_NAME, Key: key, Body: file.data, ContentType: file.mimetype,
    CacheControl: "private, no-store",
  }));
  return key;
};

/**
 * Streams a package's proof photo. Admins with order access, or the rider
 * the package is assigned to.
 */
export const getProofPhoto = async ({ packageId, riderId = null }) => {
  if (!mongoose.Types.ObjectId.isValid(packageId)) throw StatusError.notFound("Photo not found");
  const pkg = await Package.findById(packageId).select("proof_of_delivery.photo_key delivery_agent.user_id").lean();
  if (!pkg?.proof_of_delivery?.photo_key) throw StatusError.notFound("Photo not found");
  if (riderId && String(pkg.delivery_agent?.user_id || "") !== String(riderId)) throw StatusError.notFound("Photo not found");
  const object = await s3Client.send(new GetObjectCommand({ Bucket: envs.s3.BUCKET_NAME, Key: pkg.proof_of_delivery.photo_key }));
  return { body: object.Body, contentType: object.ContentType || "image/jpeg" };
};
