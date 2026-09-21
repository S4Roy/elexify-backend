import { resolveCustomerAddress } from "./resolveCustomerAddress.js";
import User from "../../models/User.js";
import Address from "../../models/Address.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { findExact, syncMapped } from "./ZohoMappingService.js";
import { customerPayload } from "./customerPayload.js";
import { sourceHash, recordSource } from "./ZohoSourceChanges.js";

export const findContact = async (connection, payload) => {
  const identity = payload.notes?.match(/ — Elexify customer (.+)$/)?.[1];
  const legacyName = identity ? `Elexify ${identity}` : payload.contact_name;
  const byIdentity = await findExact(connection, "contacts", { contact_name: legacyName, filter_by: "Status.All" },
    candidate => candidate.contact_type === "customer" && candidate.contact_name === legacyName);
  if (byIdentity) return byIdentity;
  const person = payload.contact_persons?.[0] || {};
  const email = String(person.email || "").trim().toLowerCase();
  if (email) {
    const match = await findExact(connection, "contacts", { email, filter_by: "Status.All" },
      candidate => candidate.contact_type === "customer" && String(candidate.email || "").trim().toLowerCase() === email);
    if (match) return match;
  }
  const mobile = String(person.mobile || "").replace(/\D/g, "");
  if (mobile) {
    const matchesMobile = candidate => candidate.contact_type === "customer" &&
      [candidate.phone, candidate.mobile].some(value => value && String(value).replace(/\D/g, "") === mobile);
    const match = await findExact(connection, "contacts", { phone: mobile, filter_by: "Status.All" }, matchesMobile);
    if (match) return match;
    const fallback = await findExact(connection, "contacts", { filter_by: "Status.All" }, matchesMobile);
    if (fallback) return fallback;
  }
  if (identity) return findExact(connection, "contacts", { contact_name: payload.contact_name, filter_by: "Status.All" },
    candidate => candidate.contact_type === "customer" && candidate.notes?.endsWith(` — Elexify customer ${identity}`));
  return null;
};

export const syncContact = async (connection, userId, order = null) => {
  const hash = userId ? await sourceHash("contact", userId) : null;
  const user = userId ? await User.findById(userId).lean() : null;
  if (!user && !order) throw new ZohoError("CUSTOMER_NOT_FOUND");
  const address = user ? await Address.findOne({ user: user._id, deleted_at: null, is_default: true }).lean() : null;
  const billing = await resolveCustomerAddress(order?.billing_address_snapshot || address || {});
  const shipping = order?.shipping_address_snapshot ? await resolveCustomerAddress(order.shipping_address_snapshot) : billing;
  if (!billing?.full_name && !user?.name) throw new ZohoError("CUSTOMER_IDENTITY_REQUIRED");
  const identity = user ? String(user._id) : `order-${order.id}`;
  const payload = customerPayload(user, { billing_address: billing || {}, shipping_address: shipping || {} }, identity);
  const gstin = billing?.gstin || user?.gstin;
  if (gstin) {
    payload.gst_no = gstin;
    payload.gst_treatment = "business_gst";
    payload.customer_sub_type = "business";
  } else if (user?.gst_treatment) payload.gst_treatment = user.gst_treatment;
  const lookup = async () => {
    if (user?.zoho_contact_id && user.zoho_organization_id === connection.organization_id) {
      return (await booksClient(connection, "GET", `contacts/${user.zoho_contact_id}`)).contact;
    }
    return findContact(connection, payload);
  };
  const remote = await syncMapped({ connection, kind: "contact", identity, path: "contacts", singular: "contact", payload, lookup,
    beforeUpdate: async remoteId => {
      const existing = (await booksClient(connection, "GET", `contacts/${remoteId}`)).contact;
      if (!existing || existing.status === "inactive") throw new ZohoError("CONTACT_INACTIVE_REVIEW_REQUIRED");
      if (gstin && existing.gst_no && gstin !== existing.gst_no) throw new ZohoError("CONTACT_GST_CONFLICT_REVIEW_REQUIRED");
      if (existing.contact_name !== `Elexify ${identity}`) payload.contact_name = existing.contact_name;
      const primary = existing.contact_persons?.find(person => person.is_primary_contact);
      if (primary) payload.contact_persons[0].contact_person_id = primary.contact_person_id;
    },
  });
  if (user) await User.updateOne({ _id: user._id }, { $set: { zoho_contact_id: remote.contact_id,
    zoho_customer_id: remote.contact_id, zoho_organization_id: connection.organization_id } });
  if (user) await recordSource(connection, "contact", user._id, identity, hash);
  return remote.contact_id;
};
