// One-time cleanup for images uploaded before upload-time optimization existed.
// Those originals (≈1.6 MB average, many without Cache-Control) exhausted the
// CloudFront data allowance. Each oversized image is backed up to
// `originals-backup/<key>` (private, never served), then re-encoded in place under
// the same key so every stored URL keeps working, and CloudFront is invalidated.
//
//   node src/scripts/cli.js dry-run optimize-media-images
//   node src/scripts/cli.js run optimize-media-images
//   node src/scripts/optimizeMediaImages.js --restore <key-or-prefix>
import { fileURLToPath } from "url";
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client } from "../services/awsService/awsConfig.js";
import { invalidatePaths } from "../services/awsService/cloudfrontInvalidate.js";
import { envs } from "../config/index.js";
import { optimizeImage } from "../services/media/optimizeImage.js";
import { createLogger } from "./shared/logger.js";

export const BACKUP_PREFIX = "originals-backup/";
export const CACHE_CONTROL = "public, max-age=31536000, immutable";
const SIZE_THRESHOLD = 300 * 1024;
const CONCURRENCY = 4;
const SAMPLE_SIZE = 10;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const MIME_BY_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const copySource = (bucket, key) => `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
const mimeFor = (key, head) => head?.ContentType?.startsWith("image/")
  ? head.ContentType
  : MIME_BY_EXT[key.split(".").pop().toLowerCase()];
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function bodyBuffer(body) {
  if (body?.transformToByteArray) return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function exists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}

async function listImages(s3, bucket) {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }));
    for (const { Key, Size } of page.Contents ?? []) {
      if (!Key.startsWith(BACKUP_PREFIX) && IMAGE_EXT.test(Key)) objects.push({ key: Key, size: Size });
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// One wildcard per top-level folder keeps invalidations far below the free 1,000 paths.
export const invalidationPaths = (keys) => [...new Set(keys.map((key) => (key.includes("/") ? `${key.split("/")[0]}/*` : key)))];

// Candidates: oversized images, or images missing a cache header, not yet processed.
async function findCandidates({ s3, bucket }) {
  const images = await listImages(s3, bucket);
  const candidates = [];
  await mapLimit(images, CONCURRENCY * 2, async (object) => {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: object.key }));
    if (head.Metadata?.optimized === "1") return;
    if (object.size > SIZE_THRESHOLD || !head.CacheControl) candidates.push({ ...object, head });
  });
  return { scanned: images.length, candidates: candidates.sort((a, b) => b.size - a.size) };
}

export async function runOptimizeMediaImages({
  apply = false,
  logger = createLogger(),
  s3 = s3Client,
  bucket = envs.s3.BUCKET_NAME,
  invalidate = invalidatePaths,
} = {}) {
  if (!bucket) throw new Error("S3 bucket is not configured (S3_BUCKET_NAME).");
  logger.info(apply ? "=== Optimizing media images ===" : "=== DRY RUN — no writes will be made ===");
  const { scanned, candidates } = await findCandidates({ s3, bucket });
  const bytesBefore = candidates.reduce((sum, c) => sum + c.size, 0);
  logger.info(`Scanned ${scanned} images; ${candidates.length} need work (${mb(bytesBefore)}).`);

  if (!apply) {
    // Estimate savings from the largest few; nothing is written.
    let sampleBefore = 0;
    let sampleAfter = 0;
    for (const c of candidates.slice(0, SAMPLE_SIZE)) {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: c.key }));
      const buffer = await bodyBuffer(object.Body);
      const { buffer: out } = await optimizeImage(buffer, mimeFor(c.key, c.head));
      sampleBefore += buffer.length;
      sampleAfter += out.length;
    }
    const ratio = sampleBefore ? sampleAfter / sampleBefore : 1;
    const preview = {
      scanned,
      candidates: candidates.length,
      bytes_before: bytesBefore,
      estimated_bytes_after: Math.round(bytesBefore * ratio),
      sample_ratio: Number(ratio.toFixed(3)),
      largest: candidates.slice(0, 20).map((c) => ({ key: c.key, size: c.size, cache_control: c.head.CacheControl ?? null })),
    };
    logger.info(`Estimated after: ${mb(preview.estimated_bytes_after)} (sample of ${Math.min(SAMPLE_SIZE, candidates.length)} keeps ${(ratio * 100).toFixed(0)}% of bytes).`);
    return { result: null, dryRunPreview: preview };
  }

  const done = [];
  const failed = [];
  let bytesAfter = 0;
  await mapLimit(candidates, CONCURRENCY, async (c) => {
    try {
      const backupKey = `${BACKUP_PREFIX}${c.key}`;
      if (!(await exists(s3, bucket, backupKey))) {
        await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: backupKey, CopySource: copySource(bucket, c.key) }));
      }
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: c.key }));
      const buffer = await bodyBuffer(object.Body);
      const { buffer: out, contentType, changed } = await optimizeImage(buffer, mimeFor(c.key, c.head));
      const common = { Bucket: bucket, Key: c.key, CacheControl: CACHE_CONTROL, ACL: "public-read", Metadata: { optimized: "1" } };
      if (changed) {
        await s3.send(new PutObjectCommand({ ...common, Body: out, ContentType: contentType }));
      } else {
        // Already small enough: only add the cache header (and the processed marker).
        await s3.send(new CopyObjectCommand({
          ...common,
          CopySource: copySource(bucket, c.key),
          MetadataDirective: "REPLACE",
          ContentType: mimeFor(c.key, c.head),
        }));
      }
      bytesAfter += changed ? out.length : buffer.length;
      done.push(c.key);
      if (done.length % 25 === 0) logger.info(`…${done.length}/${candidates.length} done`);
    } catch (error) {
      failed.push({ key: c.key, error: error?.message || String(error) });
      logger.error(`Failed ${c.key}: ${error?.message || error}`);
    }
  });

  const paths = invalidationPaths(done);
  if (paths.length) await invalidate(paths);
  logger.info(`Optimized ${done.length}/${candidates.length} images: ${mb(bytesBefore)} → ${mb(bytesAfter)}. Invalidated ${paths.join(", ") || "nothing"}.`);
  if (failed.length) logger.error(`${failed.length} failed; re-run to retry them.`);
  return { result: { scanned, processed: done.length, failed, bytes_before: bytesBefore, bytes_after: bytesAfter, invalidated: paths }, dryRunPreview: null };
}

// Copies originals back from the backup prefix (one key, or every key under a prefix).
export async function restoreOriginals({ target, s3 = s3Client, bucket = envs.s3.BUCKET_NAME, invalidate = invalidatePaths, logger = createLogger() }) {
  if (!target) throw new Error("Pass a key or prefix to restore.");
  const restored = [];
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${BACKUP_PREFIX}${target}`, ContinuationToken }));
    for (const { Key } of page.Contents ?? []) {
      const key = Key.slice(BACKUP_PREFIX.length);
      // Metadata is copied from the backup, so the original content type comes back exactly.
      await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: copySource(bucket, Key), ACL: "public-read" }));
      restored.push(key);
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  if (restored.length) await invalidate(invalidationPaths(restored));
  logger.info(`Restored ${restored.length} original(s).`);
  return restored;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--restore");
  if (index === -1) {
    console.error("Use `node src/scripts/cli.js dry-run|run optimize-media-images`, or --restore <key-or-prefix>.");
    process.exit(1);
  }
  restoreOriginals({ target: process.argv[index + 1] })
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
}
