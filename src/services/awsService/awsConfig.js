import AWS from "aws-sdk";
import { envs } from "../../config/index.js";

// AWS configuration
AWS.config.update({
  accessKeyId: envs.aws.accessKeyId,
  secretAccessKey: envs.aws.secretAccessKey,
  region: envs.aws.region,
});

export { AWS };
