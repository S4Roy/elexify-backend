import { s3Client, cloudFrontClient } from "./awsConfig.js";
import { invalidatePaths } from "./cloudfrontInvalidate.js";

export { s3Client, cloudFrontClient, invalidatePaths };
