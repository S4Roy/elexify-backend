import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const UserSchema = new Schema(
  {
    role: {
      type: String,
      required: true,
      enum: [
        "superadmin",
        "manager",
        "supervisor",
        "staff",
        "customer",
        "vendor",
        "operator",
        "user",
      ],
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: false,
      // no default: null — omit field entirely for mobile-only users
      lowercase: true,
      trim: true,
    },
    phone_code: {
      type: String,
      required: false,
      default: null,
    },
    mobile: {
      type: String,
      required: false,
      default: null,
    },
    address: {
      type: String,
      required: false,
      default: null,
    },
    password: {
      type: String,
      required: false,
      default: null,
    },
    profile_image: {
      type: String,
      required: false,
      default: null,
    },
    reset_token: {
      type: String,
      required: false,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    email_verified_at: {
      type: Date,
      default: null,
    },
    mobile_verified_at: {
      type: Date,
      default: null,
    },
    // Set while an email/mobile change is awaiting OTP confirmation.
    // The verified `email`/`mobile` fields above are never overwritten
    // until the OTP against the pending value succeeds — see
    // controllers/user/account/{request,verify}{Email,Mobile}Change.js
    pending_email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: null,
    },
    pending_mobile: {
      type: String,
      required: false,
      trim: true,
      default: null,
    },
    pending_phone_code: {
      type: String,
      required: false,
      default: null,
    },
    dob: {
      type: Date,
      required: false,
      default: null,
    },
    gender: {
      type: String,
      required: false,
      enum: ["male", "female", "other", null],
      default: null,
    },
    zoho_customer_id: {
      type: String,
      default: null,
    },
    google_id: {
      type: String,
      required: false,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    created_by: {
      type: Types.ObjectId,
      default: null,
    },
    updated_at: {
      type: Date,
      default: null,
    },
    updated_by: {
      type: Types.ObjectId,
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    deleted_by: {
      type: Types.ObjectId,
      default: null,
    },
    seller_details: {
      type: Types.ObjectId,
      ref: "seller_details",
      default: null,
    },
  },
  { versionKey: false },
);

// ── Indexes — partial indexes, NOT sparse ─────────────────────────────────
// sparse only excludes documents missing the field; it still indexes an
// explicit `null` value, so two docs with email: null collide on the
// unique index (E11000, keyValue: { email: null }). A partialFilterExpression
// with $type excludes null (and missing) values from the index entirely.

// email: unique per real email among non-deleted users. null/missing email
// excluded (mobile-only users allowed); soft-deleted users excluded so a
// deleted account never blocks a real user from claiming that email later.
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
      deleted_at: null,
    },
  },
);

// mobile: unique per phone_code+mobile combo among non-deleted users.
UserSchema.index(
  { phone_code: 1, mobile: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phone_code: { $type: "string" },
      mobile: { $type: "string" },
      deleted_at: null,
    },
  },
);

// google_id: unique per Google account among non-deleted users.
UserSchema.index(
  { google_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      google_id: { $type: "string" },
      deleted_at: null,
    },
  },
);

UserSchema.plugin(mongooseAggregatePaginate);

const User = model("users", UserSchema);

export default User;
