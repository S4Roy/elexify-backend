import { S3Client } from "@aws-sdk/client-s3";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { envs } from "../../config/index.js";

const credentials = {
  accessKeyId: envs.aws.accessKeyId,
  secretAccessKey: envs.aws.secretAccessKey,
};

const s3Client = new S3Client({
  region: envs.aws.region,
  credentials,
});

// CloudFront is a global service; its API endpoint lives in us-east-1.
const cloudFrontClient = new CloudFrontClient({
  region: "us-east-1",
  credentials,
});

export { s3Client, cloudFrontClient };
