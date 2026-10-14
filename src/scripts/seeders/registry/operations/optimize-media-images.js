import { runOptimizeMediaImages } from "../../../optimizeMediaImages.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runOptimizeMediaImages({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "optimize-media-images",
  name: "Optimize Media Images",
  description: "Shrinks oversized images already in S3 (max 1600px; JPEG, or PNG when transparent) and adds a one-year Cache-Control, in place under the same keys. Originals are kept under originals-backup/ and CloudFront is invalidated.",
  type: "REPAIR",
  category: "content",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Rewrites every image over 300 KB or missing Cache-Control in the media bucket; URLs are unchanged. Restore with `node src/scripts/optimizeMediaImages.js --restore <key-or-prefix>`.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
