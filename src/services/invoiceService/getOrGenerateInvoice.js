import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Invoice from "../../models/Invoice.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import Address from "../../models/Address.js";
import { StatusError } from "../../config/index.js";
import { canGenerateInvoice } from "../../constants/orderStatus.js";
import { nextInvoiceNumber } from "./generateInvoiceNumber.js";
import { computeGst } from "./computeGst.js";
import { amountInWords } from "./amountInWords.js";
import { snapshotAddress } from "./snapshotAddress.js";
import { getCompanySettings } from "./getCompanySettings.js";

// Builds an invoice line item from an OrderItem, falling back to a live
// Product/ProductVariation lookup only when the snapshot fields
// (product_name/sku/variation_name) are missing — i.e. orders placed
// before those fields existed. Going forward every OrderItem carries its
// own snapshot and this fallback never triggers.
const buildItemSnapshot = async (item, gstPerItem) => {
  let productName = item.product_name;
  let sku = item.sku;
  let variationName = item.variation_name;

  if (!productName || !sku) {
    const [product, variation] = await Promise.all([
      Product.findById(item.product_id).select("name sku"),
      item.variation_id
        ? ProductVariation.findById(item.variation_id).select(
            "sku combination_key",
          )
        : Promise.resolve(null),
    ]);
    productName = productName || product?.name || "Product";
    sku = sku || variation?.sku || product?.sku || null;
    variationName = variationName || variation?.combination_key || null;
  }

  const quantity = item.quantity || 0;
  const total = item.total_price || 0;
  const unitPrice = item.unit_price || 0;
  const discount = Math.max(
    0,
    (item.regular_price || unitPrice) * quantity - total,
  );
  const hasStoredFinancials = item.final_line_total != null && item.final_line_total !== 0;
  const itemGst = hasStoredFinancials ? {
    taxableAmount: item.taxable_amount,
    taxRate: item.tax_rate,
    taxAmount: item.tax_amount,
    cgst: item.cgst,
    sgst: item.sgst,
    igst: item.igst,
  } : gstPerItem(total);

  return {
    product_name: productName,
    sku,
    variation_name: variationName,
    quantity,
    unit_price: unitPrice,
    discount: hasStoredFinancials
      ? Number(((item.sale_discount || 0) + (item.quantity_discount || 0) + (item.coupon_discount || 0)).toFixed(2))
      : Number(discount.toFixed(2)),
    sale_discount: item.sale_discount || 0,
    quantity_discount: item.quantity_discount || 0,
    coupon_discount: item.coupon_discount || 0,
    shipping_allocation: item.shipping_allocation || 0,
    taxable_amount: itemGst.taxableAmount,
    tax_rate: itemGst.taxRate,
    tax_amount: itemGst.taxAmount,
    cgst: itemGst.cgst,
    sgst: itemGst.sgst,
    igst: itemGst.igst,
    total: hasStoredFinancials ? item.final_line_total : total,
  };
};

const resolveAddressSnapshot = async (order, snapshotField, refField) => {
  if (order[snapshotField]) return order[snapshotField];
  if (!order[refField]) return null;
  const address = await Address.findById(order[refField]);
  return snapshotAddress(address);
};

// Idempotent: returns the existing Invoice if one already exists for this
// order (no new invoice number is ever burned on a repeat call). Otherwise
// atomically claims the order, allocates a sequential invoice number, and
// freezes a full snapshot into a new Invoice document. Shared verbatim by
// both the customer and admin controllers — there is exactly one
// calculation path.
export const getOrGenerateInvoice = async ({ orderId, actorType }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw StatusError.notFound("Order not found");
  }

  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) {
    throw StatusError.notFound("Order not found");
  }

  const existing = await Invoice.findOne({ order_id: order._id });
  if (existing) {
    // Self-heal the denormalized pointer if it ever drifted out of sync.
    if (!order.invoice?.generated) {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            "invoice.generated": true,
            "invoice.invoice_number": existing.invoice_number,
            "invoice.invoice_date": existing.invoice_date,
            "invoice.generated_at": existing.generated_at,
          },
        },
      );
    }
    return existing;
  }

  if (!canGenerateInvoice(order)) {
    throw StatusError.badRequest(
      "Invoice is not available for this order yet. It becomes available once the order is confirmed.",
    );
  }

  // Atomic claim — prevents a double-click / concurrent request from
  // burning two invoice-number counter values for the same order.
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, "invoice.generated": { $ne: true } },
    { $set: { "invoice.generated": true } },
    { new: true },
  );

  if (!claimed) {
    // Lost the race — another request is/just did generate it.
    const race = await Invoice.findOne({ order_id: order._id });
    if (race) return race;
    // Extremely unlikely (claim won by a request that then failed before
    // writing the Invoice doc) — surface a clear error rather than hang.
    throw StatusError.conflict(
      "Invoice generation is already in progress for this order. Please try again.",
    );
  }

  const now = new Date();
  const { invoiceNumber, financialYear } = await nextInvoiceNumber(now);

  const [orderItems, billingAddress, shippingAddress] = await Promise.all([
    OrderItem.find({ order_id: order._id }),
    resolveAddressSnapshot(
      order,
      "billing_address_snapshot",
      "billing_address",
    ),
    resolveAddressSnapshot(
      order,
      "shipping_address_snapshot",
      "shipping_address",
    ),
  ]);

  const company = await getCompanySettings();
  const gst = computeGst({
    grandTotal: order.grand_total,
    shippingState: shippingAddress?.state,
    company,
  });
  const itemCount = orderItems.length || 1;
  const hasStoredFinancials = orderItems.length > 0 && orderItems.every(
    (item) => item.final_line_total != null && item.final_line_total !== 0,
  );
  // Distribute the order-level tax evenly across items for line-level
  // display only — the authoritative tax figure is the order-level total
  // computed once above, never re-summed from these per-item shares.
  const gstPerItem = () => ({
    taxableAmount: gst.isGstApplicable
      ? Number((gst.taxableAmount / itemCount).toFixed(2))
      : 0,
    taxRate: gst.taxRate,
    taxAmount: gst.isGstApplicable
      ? Number((gst.taxAmount / itemCount).toFixed(2))
      : 0,
    cgst: gst.isGstApplicable ? Number((gst.cgst / itemCount).toFixed(2)) : 0,
    sgst: gst.isGstApplicable ? Number((gst.sgst / itemCount).toFixed(2)) : 0,
    igst: gst.isGstApplicable ? Number((gst.igst / itemCount).toFixed(2)) : 0,
  });

  const items = await Promise.all(
    orderItems.map((item) => buildItemSnapshot(item, gstPerItem)),
  );

  const productDiscount = Number(items.reduce(
    (sum, item) => sum + (hasStoredFinancials
      ? (item.sale_discount || 0) + (item.quantity_discount || 0)
      : (item.discount || 0)), 0,
  ).toFixed(2));
  const storedTaxTotal = Number(items.reduce((sum, item) => sum + (item.tax_amount || 0), 0).toFixed(2));
  const storedCouponTotal = Number(items.reduce((sum, item) => sum + (item.coupon_discount || 0), 0).toFixed(2));
  const storedShippingTotal = Number(items.reduce((sum, item) => sum + (item.shipping_allocation || 0), 0).toFixed(2));

  const totals = {
    subtotal: order.total_amount || 0,
    product_discount: productDiscount,
    coupon_discount: hasStoredFinancials ? storedCouponTotal : order.discount || 0,
    shipping: hasStoredFinancials ? storedShippingTotal : order.shipping || 0,
    cod_fee: order.cod_fee || 0,
    tax_total: hasStoredFinancials ? storedTaxTotal : (gst.isGstApplicable ? gst.taxAmount : 0),
    grand_total: order.grand_total,
    amount_in_words: amountInWords(order.grand_total),
  };

  const invoice = await Invoice.create({
    order_id: order._id,
    invoice_number: invoiceNumber,
    invoice_date: now,
    financial_year: financialYear,
    generated_at: now,
    generated_by: actorType,

    order_number: order.id,
    order_date: order.created_at,
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    currency: order.currency || "INR",

    billing_address: billingAddress,
    shipping_address: shippingAddress,

    company,

    items,
    totals,
    is_gst_applicable: hasStoredFinancials
      ? items.some((item) => Number(item.tax_rate) > 0)
      : gst.isGstApplicable,
  });

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "invoice.invoice_number": invoiceNumber,
        "invoice.invoice_date": now,
        "invoice.generated_at": now,
      },
    },
  );

  return invoice;
};
