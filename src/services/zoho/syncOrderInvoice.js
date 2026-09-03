import Invoice from "../../models/Invoice.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import { StatusError } from "../../config/index.js";
import { getOrGenerateInvoice } from "../invoiceService/getOrGenerateInvoice.js";
import { createCustomer } from "./createCustomer.js";
import { createInvoice } from "./createInvoice.js";

const safeError = (error) => {
  const value = typeof error === "string" ? error : error?.message || "Zoho invoice synchronization failed";
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 500);
};

const ensureZohoCustomer = async (order, invoice) => {
  const user = await User.findById(order.user);
  if (!user) throw StatusError.badRequest("Order customer is unavailable");
  if (user.zoho_customer_id) return user.zoho_customer_id;
  const address = invoice.billing_address || {};
  const response = await createCustomer({
    contact_name: user.name,
    email: user.email,
    billing_address: {
      address: [address.address_line_1, address.address_line_2].filter(Boolean).join(", "),
      city: address.city_name || address.city?.name || "",
      state: address.state_name || address.state?.name || "",
      zip: address.postcode || "",
      country: address.country_name || address.country?.name || "India",
    },
  });
  const customerId = response?.data?.contact?.contact_id;
  if (!response?.success || !customerId) throw new Error("Unable to create the customer in Zoho Books");
  await User.updateOne({ _id: user._id }, { $set: { zoho_customer_id: customerId } });
  return customerId;
};

export const syncOrderInvoiceToZoho = async ({ orderId }) => {
  const localInvoice = await getOrGenerateInvoice({ orderId, actorType: "admin" });
  if (localInvoice.zoho?.sync_status === "synced" && localInvoice.zoho?.invoice_id) return localInvoice;

  const staleAttempt = new Date(Date.now() - 5 * 60 * 1000);
  const claimed = await Invoice.findOneAndUpdate(
    {
      _id: localInvoice._id,
      $or: [
        { "zoho.sync_status": { $ne: "syncing" } },
        { "zoho.last_attempt_at": { $lt: staleAttempt } },
      ],
    },
    { $set: { "zoho.sync_status": "syncing", "zoho.last_attempt_at": new Date(), "zoho.last_error": null }, $inc: { "zoho.attempts": 1 } },
    { new: true },
  );
  if (!claimed) throw StatusError.conflict("Zoho invoice synchronization is already in progress");

  try {
    const order = await Order.findById(orderId);
    if (!order) throw StatusError.notFound("Order not found");
    const customerId = await ensureZohoCustomer(order, claimed);
    const lineItems = (claimed.items || []).map((item) => ({
      name: [item.product_name, item.variation_name].filter(Boolean).join(" - "),
      description: item.sku ? `SKU: ${item.sku}` : undefined,
      quantity: item.quantity,
      rate: Number(item.quantity) ? Number((item.total / item.quantity).toFixed(2)) : item.total,
    }));
    if (claimed.totals?.shipping) lineItems.push({ name: "Shipping", quantity: 1, rate: claimed.totals.shipping });
    if (claimed.totals?.cod_fee) lineItems.push({ name: "COD handling fee", quantity: 1, rate: claimed.totals.cod_fee });

    const response = await createInvoice({
      customer_id: customerId,
      invoice_number: claimed.invoice_number,
      reference_number: claimed.order_number,
      date: claimed.invoice_date.toISOString().slice(0, 10),
      currency_code: claimed.currency,
      line_items: lineItems,
      notes: `Elexify order ${claimed.order_number}`,
    });
    if (!response?.success || !response?.data?.invoice_id) {
      throw new Error(safeError(response?.error || "Zoho did not return an invoice ID"));
    }
    const external = response.data;
    return Invoice.findByIdAndUpdate(claimed._id, { $set: {
      "zoho.sync_status": "synced",
      "zoho.invoice_id": String(external.invoice_id),
      "zoho.invoice_number": external.invoice_number || null,
      "zoho.status": external.status || null,
      "zoho.invoice_url": external.invoice_url || null,
      "zoho.synced_at": new Date(),
      "zoho.last_error": null,
    } }, { new: true });
  } catch (error) {
    await Invoice.updateOne({ _id: claimed._id }, { $set: { "zoho.sync_status": "failed", "zoho.last_error": safeError(error) } });
    throw error;
  }
};
