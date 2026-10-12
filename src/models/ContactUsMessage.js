import mongoose from 'mongoose';
import aggregatePaginate from 'mongoose-aggregate-paginate-v2';

const schema = new mongoose.Schema({
  contact_id: { type: mongoose.Schema.Types.ObjectId, ref: 'contact_us', required: true },
  request_id: { type: String, required: true },
  kind: { type: String, enum: ['reply', 'note', 'activity'], required: true },
  content: { type: String, required: true, maxlength: 10000 },
  added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  author_name: { type: String, default: 'Support team' },
  recipient: String,
  delivery_status: { type: String, enum: ['sending', 'sent', 'failed', 'unknown'], default: undefined },
  message_id: String,
  sent_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
schema.index({ contact_id: 1, request_id: 1 }, { unique: true });
schema.index({ contact_id: 1, created_at: -1, _id: -1 });
schema.plugin(aggregatePaginate);
export default mongoose.model('contact_us_messages', schema);
