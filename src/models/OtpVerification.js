import mongoose from "mongoose";
const { Schema, model } = mongoose;

const OtpVerificationSchema = new Schema(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      index: true,
    },

    mobile: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    otp: {
      type: String, // 🔐 store hashed OTP (not number)
      required: true,
    },

    purpose: {
      type: String,
      required: true,
      enum: ["register", "login", "resetpassword"],
      index: true,
    },

    token: {
      type: String,
      required: false,
    },

    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    verified_at: {
      type: Date,
      default: null,
    },

    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

/* 🔥 Auto-delete expired OTPs */
OtpVerificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

/* 🔎 Fast lookup */
OtpVerificationSchema.index({ mobile: 1, type: 1 });
OtpVerificationSchema.index({ email: 1, type: 1 });

const OtpVerification = model("otp_verifications", OtpVerificationSchema);

export default OtpVerification;
