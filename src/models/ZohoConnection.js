import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, default: "books", unique: true },
  connected: { type: Boolean, default: false },
  enabled: { type: Boolean, default: false },
  enabled_since: Date,
  region: { type: String, default: "in" },
  organization_id: String,
  access_token: { type: String, select: false },
  refresh_token: { type: String, select: false },
  expires_at: Date,
  generation: { type: Number, default: 0 },
  currency: String,
  tax_map: { type: Map, of: String, default: {} },
  last_success_at: Date,
  paused_until: Date,
  next_request_at: Date,
  revocation_token: { type: String, select: false },
  revocation_pending: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model("zoho_connections", schema);
