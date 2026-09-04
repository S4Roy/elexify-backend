import Media from "../../models/Media.js";
import { envs } from "../../config/index.js";
import { s3Handler } from "../../services/s3Handler/s3Handler.js";

export const cleanupReturnEvidence = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orphaned = await Media.find({
    reference_type: "return_requests",
    reference_id: null,
    created_at: { $lt: cutoff },
  }).limit(100);
  for (const media of orphaned) {
    try {
      await s3Handler.deleteObject({ bucket: envs.s3.BUCKET_NAME, key: media.url });
      if (media.thumbnail) await s3Handler.deleteObject({ bucket: envs.s3.BUCKET_NAME, key: media.thumbnail });
      await Media.deleteOne({ _id: media._id, reference_id: null });
    } catch (error) {
      console.error(`Unable to clean orphaned return evidence ${media._id}:`, error.message);
    }
  }
};
