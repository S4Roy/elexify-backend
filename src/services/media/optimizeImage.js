import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

// Store images were uploaded at full camera resolution (≈1.6 MB average), which is
// what exhausted the CloudFront data allowance. Every image written to S3 goes
// through here: at most 1600px on the long side, JPEG for photos, palette PNG
// when the image needs transparency.
export const MAX_DIMENSION = 1600;
const MIN_SAVING = 0.1;
const OPTIMIZABLE = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export const isOptimizableImage = (mimetype) => OPTIMIZABLE.has(String(mimetype || "").toLowerCase());

// Returns { buffer, contentType, changed }. GIF (possibly animated), SVG, video and
// anything sharp can't read come back untouched, as does any image the re-encode
// would not shrink by at least 10%.
export async function optimizeImage(buffer, mimetype) {
  const original = { buffer, contentType: mimetype, changed: false };
  if (!buffer?.length || !isOptimizableImage(mimetype)) return original;
  try {
    const image = sharp(buffer, { failOn: "none" });
    const { hasAlpha } = await image.metadata();
    const pipeline = image
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
    const encoded = hasAlpha
      ? await pipeline.png({ palette: true, quality: 80, compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();
    if (encoded.length > buffer.length * (1 - MIN_SAVING)) return original;
    return { buffer: encoded, contentType: hasAlpha ? "image/png" : "image/jpeg", changed: true };
  } catch {
    return original;
  }
}

// Small JPEG preview for lists and grids (stored on Media.thumbnail).
export async function makeThumbnail(buffer, width = 600) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
}

// File extension matching the optimized content type, for new upload keys.
export const extensionFor = (contentType) => (contentType === "image/png" ? ".png" : contentType === "image/jpeg" ? ".jpg" : null);
