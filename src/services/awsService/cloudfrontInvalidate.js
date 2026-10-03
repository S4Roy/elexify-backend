import { CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { cloudFrontClient } from "./awsConfig.js";
import { envs } from "../../config/index.js";

// Objects are uploaded with `Cache-Control: immutable`, so when a key is
// overwritten in place CloudFront keeps serving the old copy until it's
// invalidated. Best-effort: the S3 write already succeeded, so a failure
// here is logged rather than failing the request.
export const invalidatePaths = async (keys = []) => {
  const distributionId = envs.aws.cloudfrontDistributionId;
  const paths = [
    ...new Set(
      keys.filter(Boolean).map((key) => (key.startsWith("/") ? key : `/${key}`))
    ),
  ];
  if (!distributionId || paths.length === 0) return null;

  try {
    return await cloudFrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          Paths: { Quantity: paths.length, Items: paths },
        },
      })
    );
  } catch (error) {
    console.error("CloudFront invalidation failed", { paths, error: error?.message });
    return null;
  }
};
