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
      // sparse index only excludes MISSING fields in MongoDB 7.0, not null values
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
    zoho_customer_id: {
      type: String,
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

// ── Indexes — defined here only (not on field) to ensure sparse is respected ──
// email: unique per real email, null values excluded (mobile-only users allowed)
UserSchema.index({ email: 1 }, { unique: true, sparse: true });

// mobile: unique per phone_code+mobile combo, null values excluded
UserSchema.index({ phone_code: 1, mobile: 1 }, { unique: true, sparse: true });

UserSchema.plugin(mongooseAggregatePaginate);

const User = model("users", UserSchema);

export default User;
