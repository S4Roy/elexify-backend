import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  sample_key: { type: String, maxlength: 80 },
  name: { type: String, required: true, maxlength: 120 },
  subject: { type: String, required: true, maxlength: 200 },
  preheader: { type: String, default: '', maxlength: 200 },
  body: { type: String, required: true, maxlength: 50000 },
  source: { type: String, enum: ['all', 'web', 'mobile', 'api', 'widget', 'other'], default: 'all' },
  status: { type: String, enum: ['draft', 'queued', 'sending', 'completed', 'cancelled'], default: 'draft' },
  revision: { type: Number, default: 1 },
  scheduled_at: Date, audience_cutoff: Date, audience_count: Number,
  cursor: mongoose.Schema.Types.ObjectId,
  exhausted: { type: Boolean, default: false },
  confirmation_hash: { type: String, select: false }, confirmation_actor: mongoose.Schema.Types.ObjectId, confirmation_expires: Date,
  lock_token: String, lock_until: Date,
  created_by: mongoose.Schema.Types.ObjectId, updated_by: mongoose.Schema.Types.ObjectId,
  queued_by: mongoose.Schema.Types.ObjectId, completed_at: Date,
}, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
schema.index({ sample_key: 1 }, { unique: true, sparse: true });
schema.index({ status: 1, scheduled_at: 1, lock_until: 1 });
export default mongoose.model('email_campaigns', schema);
