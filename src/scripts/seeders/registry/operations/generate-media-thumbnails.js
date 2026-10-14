import { runGenerateMediaThumbnails } from "../../../generateMediaThumbnails.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runGenerateMediaThumbnails({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "generate-media-thumbnails",
  name: "Generate Media Thumbnails",
  description: "Creates 600px JPEG thumbnails for media-library images that don't have one, so product grids load small previews.",
  type: "BACKFILL",
  category: "content",
  version: 1,
  required: false,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Adds a thumbs/ object and sets Media.thumbnail for each image without one. Original images are not changed.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
