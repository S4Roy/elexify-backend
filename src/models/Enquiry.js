// models/Enquiry.js
import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const EnquirySchema = new Schema(
  {
    custom_id: { type: String },
    // Link to product (optional but recommended)
    product_id: {
      type: Types.ObjectId,
      ref: "products",
      default: null,
      index: true,
    },

    // If enquiry about a specific variation
    variation_id: {
      type: Types.ObjectId,
      ref: "product_variations",
      default: null,
      index: true,
    },

    // If the user is logged in
    user_id: { type: Types.ObjectId, ref: "users", default: null, index: true },

    // Snapshot product metadata (useful if product is later deleted/changed)
    product_name: { type: String, default: null },
    product_sku: { type: String, default: null },

    // Contact details (guest or auto-filled from user profile)
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, required: true, trim: true, maxlength: 40 },

    // The enquiry content
    message: { type: String, required: true, trim: true, maxlength: 8000 },

    // Type of enquiry - helps route/segment (ask_price, general_enquiry, stock_check, custom_request, etc.)
    type: {
      type: String,
      enum: ["ask_price", "enquiry", "stock_check", "custom_request"],
      default: "ask_price",
      index: true,
    },

    // Workflow / moderation
    status: {
      type: String,
      enum: ["open", "handled", "closed", "spam"],
      default: "open",
      index: true,
    },
    handled: { type: Boolean, default: false },
    handled_by: { type: Types.ObjectId, ref: "users", default: null },
    handled_at: { type: Date, default: null },

    // Optional admin/internal notes
    internal_notes: { type: String, default: null },

    // Metadata (for anti-spam, analytics)
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
    referrer: { type: String, default: null },
    source: { type: String, default: null }, // e.g., "product_page", "mobile_app"
    channel: { type: String, default: null }, // e.g., "web", "android", "ios"

    // Optional: capture captcha/provider verification custom_id
    captcha_token: { type: String, default: null },

    // Admin reply summary (optional quick reply info)
    reply_sent: { type: Boolean, default: false },
    reply_at: { type: Date, default: null },
    reply_by: { type: Types.ObjectId, ref: "users", default: null },

    // Soft delete
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);
EnquirySchema.pre("save", async function (next) {
  if (!this.custom_id) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const count = await this.constructor.countDocuments({
      created_at: {
        $gte: new Date().setHours(0, 0, 0, 0),
        $lt: new Date().setHours(23, 59, 59, 999),
      },
    });
    this.custom_id = `ENQ-${datePart}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});
// Indexes for common queries
EnquirySchema.index({ custom_id: 1 }, { unique: true });
EnquirySchema.index({ product_id: 1, created_at: -1 });
EnquirySchema.index({ user_id: 1, created_at: -1 });
EnquirySchema.index({ email: 1, status: 1 });
EnquirySchema.index({ mobile: 1, status: 1 });

// Optional: ensure duplicate guest enquiries aren't spammy (example: same email+product within timeframe)
// Not enforced here — better handled with rate-limit logic in controller
EnquirySchema.plugin(mongooseAggregatePaginate);

const Enquiry = model("enquiries", EnquirySchema);
export default Enquiry;
