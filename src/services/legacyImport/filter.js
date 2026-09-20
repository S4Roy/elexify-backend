import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { readSource } from './source.js';
import { sourceId } from './plan.js';

const sourcePath = fileURLToPath(new URL('../../../db-backups/eqstoxco_wp434.sql', import.meta.url));
let cache;
// The first importer used deterministic IDs but omitted review provenance.
// Recover those exact IDs from the original backup, without updating records.
export async function legacyReviewIds() {
  const info = await stat(sourcePath);
  const version = `${info.size}:${info.mtimeMs}`;
  if (!cache || cache.version !== version) {
    const promise = readSource(sourcePath, ['comments', 'options']).then(source =>
      source.tables.comments.map(row => new mongoose.Types.ObjectId(sourceId('review', row.comment_ID))));
    cache = { version, promise };
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
  }
  return cache.promise;
}
export function sourceCondition(selection, reviewIds = []) {
  const imported = { $or: [
    { 'legacy_import.source': 'eqstoxco_wp434' },
    ...(reviewIds.length ? [{ _id: { $in: reviewIds } }] : []),
  ] };
  if (selection === 'backup') return imported;
  if (selection === 'other') return { $nor: [imported] };
  return {};
}
export function sourceExpression(reviewIds = []) {
  return { $or: [
    { $eq: [{ $ifNull: ['$legacy_import.source', ''] }, 'eqstoxco_wp434'] },
    ...(reviewIds.length ? [{ $in: ['$_id', reviewIds] }] : []),
  ] };
}
