import mongoose from "mongoose";
const { Schema, model } = mongoose;

// The frozen invoice snapshot. One document per order — generated once,
// never mutated after generation. The PDF itself is rendered on-demand
// from this document on every download (see src/services/invoiceService),
// never stored as compiled bytes, so this document is the single source
// of truth for what was legally issued.
const InvoiceSchema = new Schema(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "orders",
      required: true,
      unique: true,
    },
    invoice_number: { type: String, required: true, unique: true },
    invoice_date: { type: Date, required: true },
    financial_year: { type: String, required: true },
    generated_at: { type: Date, required: true },
    generated_by: {
      type: String,
      enum: ["customer", "admin", "system"],
      required: true,
    },

    order_number: { type: String, required: true },
    order_date: { type: Date, required: true },
    payment_method: { type: String, default: null },
    payment_status: { type: String, default: null },
    currency: { type: String, default: "INR" },

    billing_address: { type: Object, default: null },
    shipping_address: { type: Object, default: null },

    company: { type: Object, default: null },

    items: [
      {
        _id: false,
        product_name: { type: String, default: null },
        sku: { type: String, default: null },
        variation_name: { type: String, default: null },
        quantity: { type: Number, required: true },
        unit_price: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        taxable_amount: { type: Number, default: 0 },
        tax_rate: { type: Number, default: 0 },
        tax_amount: { type: Number, default: 0 },
        cgst: { type: Number, default: 0 },
        sgst: { type: Number, default: 0 },
        igst: { type: Number, default: 0 },
        total: { type: Number, required: true },
      },
    ],

    totals: {
      subtotal: { type: Number, default: 0 },
      product_discount: { type: Number, default: 0 },
      coupon_discount: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      cod_fee: { type: Number, default: 0 },
      tax_total: { type: Number, default: 0 },
      grand_total: { type: Number, required: true },
      amount_in_words: { type: String, default: "" },
    },

    is_gst_applicable: { type: Boolean, default: false },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

const Invoice = model("invoices", InvoiceSchema);
export default Invoice;
