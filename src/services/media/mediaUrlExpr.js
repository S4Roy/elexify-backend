import { envs } from "../../config/index.js";

// Aggregation expression for a media thumbnail URL: absolute URL when the stored
// key is set, otherwise null so clients fall back to the full image.
export const thumbnailUrlExpr = (field) => ({
  $cond: [
    { $gt: [{ $strLenCP: { $ifNull: [field, ""] } }, 0] },
    { $concat: [envs.s3.BASE_URL, field] },
    null,
  ],
});
