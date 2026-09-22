import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  key: { type: String, required: true, unique: true, immutable: true },
  description: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  system_role: { type: Boolean, default: false },
  protected: { type: Boolean, default: false },
  permissions: [{ type: String, ref: 'permissions' }],
  deleted_at: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, optimisticConcurrency: true });
export default mongoose.model('roles', schema);
