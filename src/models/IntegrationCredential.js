import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const IntegrationCredentialSchema = new Schema(
  {
    provider: { type: String, required: true, unique: true, lowercase: true, trim: true },
    enabled: { type: Boolean, default: true },
    // Every value in credentials is AES-256-GCM ciphertext. This field must
    // never be serialized by an API; controllers explicitly select it only
    // while resolving/updating credentials.
    credentials: { type: Map, of: String, select: false, default: {} },
    last_tested_at: { type: Date, default: null },
    last_test_status: { type: String, enum: ["success", "failed", null], default: null },
    last_test_message: { type: String, default: null },
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false },
);

const IntegrationCredential = model("integration_credentials", IntegrationCredentialSchema);
export default IntegrationCredential;
