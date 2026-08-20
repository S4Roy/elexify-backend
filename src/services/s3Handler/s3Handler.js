import stream from "stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client } from "../awsService/awsConfig.js";
import { envs } from "../../config/index.js";

const S3 = s3Client;

class S3Handler {
  constructor() {}

  // v3 doesn't return a stream synchronously like v2's .createReadStream() —
  // the command has to be sent and awaited first, so this is now async.
  async readStream({ bucket, key }) {
    const response = await S3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return response.Body;
  }

  async checkKey({ bucket, key }) {
    try {
      await S3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Same external shape as before ({ writeStream, uploaded }) so callers
  // don't need to change — @aws-sdk/lib-storage's Upload is the v3
  // equivalent of v2's managed (multipart-capable) S3.upload() from a
  // stream.
  writeStream({ bucket, key, contentType }) {
    const passThrough = new stream.PassThrough();
    const upload = new Upload({
      client: S3,
      params: {
        ContentType: `${contentType}`,
        CacheControl: "public, max-age=31536000, immutable",
        Body: passThrough,
        Bucket: bucket,
        Key: key,
        ACL: "public-read",
      },
    });
    return {
      writeStream: passThrough,
      uploaded: upload.done(),
    };
  }

  async uploadToS3(file, folder = "uploads") {
    if (!file) {
      throw new Error("No file provided");
    }

    const key = folder;
    await S3.send(
      new PutObjectCommand({
        Bucket: envs.s3.BUCKET_NAME,
        Key: key,
        Body: file.data,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000, immutable",
        ACL: "public-read",
      })
    );
    // v3's PutObjectCommand response has no Location field (unlike v2's
    // managed upload) — every caller only checks truthiness or discards
    // this, so a reconstructed URL is for API cleanliness, not correctness.
    return `${envs.s3.BASE_URL}${key}`;
  }

  async deleteObject({ bucket, key }) {
    return S3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

export const s3Handler = new S3Handler();
