import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  campaign_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  subscriber_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  email: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sending', 'accepted', 'failed', 'unknown', 'skipped'], default: 'pending' },
  message_id: String, error: String, claimed_at: Date, sent_at: Date,
}, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
schema.index({ campaign_id: 1, subscriber_id: 1 }, { unique: true });
schema.index({ campaign_id: 1, status: 1, _id: 1 });
export default mongoose.model('email_campaign_recipients', schema);
