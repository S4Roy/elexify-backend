import { createRequire } from "module";
import { StatusError } from "../config/index.js";

// sharp@0.35's ESM entry uses `import ... with { type: "json" }`, which
// this project's Node runtime doesn't support — require() its CJS entry
// instead, matching the pattern already used in s3ImageResize.js.
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

const detectMime = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const hex = buffer.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("474946383761") || hex.startsWith("474946383961")) return "image/gif";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.subarray(4, 12).toString().includes("ftypavif")) return "image/avif";
  if (buffer.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "AVI ") return "video/x-msvideo";
  return null;
};

export const validateMediaUpload = async (file) => {
  const buffer = file?.data;
  const size = file?.size ?? buffer?.length ?? 0;
  const mime = detectMime(buffer);
  if (!mime) throw StatusError.badRequest("File content is not a supported image or video");
  const isImage = mime.startsWith("image/");
  if (size <= 0 || size > (isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
    throw StatusError.badRequest(isImage ? "Image exceeds the 8MB limit" : "Video exceeds the 50MB limit");
  }
  if (isImage) {
    try {
      const metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
        throw new Error("dimensions");
      }
    } catch {
      throw StatusError.badRequest("Image is malformed or exceeds dimension limits");
    }
  }
  return { mime, size, isImage, isVideo: !isImage };
};
