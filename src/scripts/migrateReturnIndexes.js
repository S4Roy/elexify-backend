// Explicit, non-destructive migration: preserve existing return documents.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ReturnRequest from '../models/ReturnRequest.js';
import Order from '../models/Order.js';
import EmailTemplate from '../models/EmailTemplate.js';
import { TEMPLATES } from '../constants/emailTemplateDefaults.js';
dotenv.config();
const uri = process.env.MONGODB_URI || `mongodb://${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}`;
try {
  await mongoose.connect(uri, { autoIndex: false });
  const indexes = await ReturnRequest.collection.indexes();
  const old = indexes.find((i) => i.unique && Object.keys(i.key).length === 1 && i.key.order_id === 1);
  if (old) await ReturnRequest.collection.dropIndex(old.name);
  await ReturnRequest.createIndexes();
  await Order.createIndexes();
  await EmailTemplate.updateOne({ action: 'return_updated', site_language: 'en' }, { $setOnInsert: { ...TEMPLATES.return_updated, action: 'return_updated', site_language: 'en', status: 'active' } }, { upsert: true });
  console.log('Return indexes migrated; existing data preserved.');
} finally { await mongoose.disconnect(); }
