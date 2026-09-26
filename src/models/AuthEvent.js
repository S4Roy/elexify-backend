import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  sessionId: mongoose.Schema.Types.ObjectId,
  actorId: mongoose.Schema.Types.ObjectId,
  eventType: { type: String, required: true },
  ipAddress: String, userAgent: String, reason: String,
  createdAt: { type: Date, default: Date.now },
});
schema.index({ customerId: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
export default mongoose.model('AuthEvent', schema);
