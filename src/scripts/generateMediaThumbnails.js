// Creates the 600px JPEG thumbnail (Media.thumbnail) for images uploaded before the
// media library generated them, so product grids and lists can load a ~30 KB
// preview instead of the full image. New uploads already get one (media/add.js).
//
//   node src/scripts/cli.js dry-run generate-media-thumbnails
//   node src/scripts/cli.js run generate-media-thumbnails
import path from "path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import Media from "../models/Media.js";
import { s3Client } from "../services/awsService/awsConfig.js";
import { envs } from "../config/index.js";
import { makeThumbnail } from "../services/media/optimizeImage.js";
import { CACHE_CONTROL } from "./optimizeMediaImages.js";
import { createLogger } from "./shared/logger.js";

const CONCURRENCY = 4;
const STILL_IMAGE = /\.(jpe?g|png|webp|avif)$/i;

// photos/2025/a.png → photos/2025/thumbs/a.jpg (same layout as media/add.js uploads)
export const thumbnailKeyFor = (key) => {
  const dir = path.posix.dirname(key);
  const name = path.posix.basename(key, path.posix.extname(key));
  return `${dir === "." ? "" : `${dir}/`}thumbs/${name}.jpg`;
};

async function bodyBuffer(body) {
  if (body?.transformToByteArray) return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function runGenerateMediaThumbnails({
  apply = false,
  logger = createLogger(),
  s3 = s3Client,
  bucket = envs.s3.BUCKET_NAME,
  MediaModel = Media,
} = {}) {
  if (!bucket) throw new Error("S3 bucket is not configured (S3_BUCKET_NAME).");
  // GIFs are skipped: a still preview would misrepresent an animation.
  const pending = (await MediaModel.find(
    { type: "image", $or: [{ thumbnail: null }, { thumbnail: "" }, { thumbnail: { $exists: false } }] },
    { url: 1 },
  ).lean()).filter((media) => STILL_IMAGE.test(media.url || ""));
  logger.info(`${pending.length} images need a thumbnail.`);
  if (!apply) {
    return { result: null, dryRunPreview: { pending: pending.length, sample: pending.slice(0, 20).map((m) => ({ url: m.url, thumbnail: thumbnailKeyFor(m.url) })) } };
  }

  let created = 0;
  const failed = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (next < pending.length) {
      const media = pending[next++];
      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: media.url }));
        const thumb = await makeThumbnail(await bodyBuffer(object.Body));
        const key = thumbnailKeyFor(media.url);
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: thumb, ContentType: "image/jpeg", CacheControl: CACHE_CONTROL, ACL: "public-read",
        }));
        await MediaModel.updateOne({ _id: media._id }, { $set: { thumbnail: key } });
        created++;
        if (created % 25 === 0) logger.info(`…${created}/${pending.length} done`);
      } catch (error) {
        failed.push({ url: media.url, error: error?.message || String(error) });
        logger.error(`Failed ${media.url}: ${error?.message || error}`);
      }
    }
  }));
  logger.info(`Created ${created}/${pending.length} thumbnails.${failed.length ? ` ${failed.length} failed; re-run to retry.` : ""}`);
  return { result: { pending: pending.length, created, failed }, dryRunPreview: null };
}
