/**
 * Stop subscription writes before applying this migration.
 * Preview: node src/scripts/dedupeSubscribers.js
 * Apply:   node src/scripts/dedupeSubscribers.js --apply
 * Original changed records are preserved in subscribers_dedupe_backup.
 * Keeps the oldest record (including its moderation/deletion status).
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";

try {
  await mongooseConnection;
  const apply = process.argv.includes("--apply");
  const collection = mongoose.connection.collection("subscribers");
  const backup = mongoose.connection.collection("subscribers_dedupe_backup");
  const seen = new Set();
  const stats = { duplicates: 0, invalid: 0, normalized: 0, apply };
  for await (const doc of collection.find().sort({ _id: 1 })) {
    const email = typeof doc.email === "string" ? doc.email.trim().toLowerCase() : "";
    const invalid = !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const duplicate = !invalid && seen.has(email);
    if (!invalid) seen.add(email);
    if (invalid) stats.invalid++;
    else if (duplicate) stats.duplicates++;
    else if (email !== doc.email) stats.normalized++;
    if (!apply || (!invalid && !duplicate && email === doc.email)) continue;
    await backup.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
    if (invalid || duplicate) await collection.deleteOne({ _id: doc._id });
    else await collection.updateOne({ _id: doc._id }, { $set: { email } });
  }
  if (apply) {
    const indexes = await collection.indexes();
    const existing = indexes.find((index) => index.key.email === 1 && Object.keys(index.key).length === 1);
    if (existing && !existing.unique) await collection.dropIndex(existing.name);
    await collection.createIndex({ email: 1 }, { unique: true });
  }
  console.log(JSON.stringify(stats));
} catch (error) {
  console.error("Subscriber migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
