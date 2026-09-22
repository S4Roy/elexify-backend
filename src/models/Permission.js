import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  module: { type: String, required: true, index: true },
  action: { type: String, required: true },
  description: { type: String, default: '' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });
export default mongoose.model('permissions', schema);
