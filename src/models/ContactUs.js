import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

/**
 * contact_us schema
 *
 * Fields:
 *  - name, email, phone, subject, message (user-submitted)
 *  - status: pending/answered/archived/spam
 *  - is_read: boolean quick-check
 *  - source: origin of submission (web, mobile, api, widget)
 *  - ip, user_agent: for abuse / fraud detection
 *  - attachments: optional media references
 *  - notes: admin notes/response history
 *  - audit fields: created_at/by, updated_at/by, deleted_at/by
 */
const ContactUsSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: false, trim: true, lowercase: true },
    phone: { type: String, required: false, trim: true },
    subject: { type: String, required: false, trim: true, maxlength: 250 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },

    // submission metadata
    source: {
      type: String,
      enum: ["web", "mobile", "api", "widget", "other"],
      default: "web",
    },
    ip: { type: String, default: null },
    user_agent: { type: String, default: null },

    // optional attached media (reference to Media collection)
    attachments: [
      {
        type: Types.ObjectId,
        ref: "media",
      },
    ],

    // status & workflow
    status: {
      type: String,
      enum: ["pending", "answered", "archived", "spam"],
      default: "pending",
    },
    is_read: { type: Boolean, default: false },

    // admin responses / notes
    notes: [
      {
        added_by: { type: Types.ObjectId, ref: "users" },
        content: { type: String, trim: true },
        created_at: { type: Date, default: Date.now },
      },
    ],

    // auditing
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes: useful for lookups and admin lists
ContactUsSchema.index({ email: 1 });
ContactUsSchema.index({ phone: 1 });
ContactUsSchema.index({ status: 1, created_at: -1 });
ContactUsSchema.index({ created_at: -1 });
ContactUsSchema.index({ ip: 1 });

// Pagination plugin (same as your Consultation schema)
ContactUsSchema.plugin(mongooseAggregatePaginate);

const ContactUs = model("contact_us", ContactUsSchema);
export default ContactUs;
