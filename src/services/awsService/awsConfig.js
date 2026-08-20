import { S3Client } from "@aws-sdk/client-s3";
import { envs } from "../../config/index.js";

const s3Client = new S3Client({
  region: envs.aws.region,
  credentials: {
    accessKeyId: envs.aws.accessKeyId,
    secretAccessKey: envs.aws.secretAccessKey,
  },
});

export { s3Client };
