import mongoose from "mongoose";
const { Schema, model } = mongoose;

const OtpVerificationSchema = new Schema(
  {
    // ── Contact identifier ──────────────────────────────────────────────────
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },

    mobile: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Used by rate-limit cooldown check (phone_code + mobile combined) ────
    identifier: {
      type: String,
      default: null,
    },

    // ── OTP (bcrypt hashed) ─────────────────────────────────────────────────
    otp: {
      type: String,
      required: true,
    },

    purpose: {
      type: String,
      required: true,
      enum: [
        "auth",
        "register",
        "login",
        "reset_password",
        "forgot_password",
        "update_contact",
        "change_email",
        "change_mobile",
      ],
    },

    token: {
      type: String,
      default: null,
    },

    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    // ── Timestamps set by controller ────────────────────────────────────────
    verified_at: {
      type: Date,
      default: null,
    },

    // expired_at: manually marked expired (e.g. on resend or wrong OTP)
    expired_at: {
      type: Date,
      default: null,
    },

    // expires_at: natural expiry time (used by TTL index)
    expires_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// ── TTL: auto-delete documents after expires_at ───────────────────────────────
OtpVerificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// ── Fast lookup by controller queries ─────────────────────────────────────────
OtpVerificationSchema.index({ identifier: 1, purpose: 1 });
OtpVerificationSchema.index({ email: 1, purpose: 1 });
OtpVerificationSchema.index({ mobile: 1, purpose: 1 });

const OtpVerification = model("otp_verifications", OtpVerificationSchema);

export default OtpVerification;
