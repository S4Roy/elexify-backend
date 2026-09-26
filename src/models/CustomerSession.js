import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  refreshTokenHash: { type: String, required: true, select: false },
  legacyTokenHash: { type: String, select: false },
  credentialChangedAt: { type: Date, default: null },
  deviceId: String, deviceName: String, deviceType: String, browser: String, os: String,
  ipAddress: String, userAgent: String,
  lastActivityAt: { type: Date, required: true },
  lastRefreshAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  logoutAt: { type: Date, default: null },
  revokeReason: String,
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ customerId: 1, revokedAt: 1, createdAt: -1 });
schema.index({ legacyTokenHash: 1 }, { unique: true, sparse: true });
schema.index({ customerId: 1, lastActivityAt: -1 });
schema.index({ lastActivityAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('CustomerSession', schema);
