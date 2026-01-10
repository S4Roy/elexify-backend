import stream from "stream";
import { awsService } from "../index.js";
import { envs } from "../../config/index.js";

const S3 = new awsService.AWS.S3();

class S3Handler {
  constructor() {}

  readStream({ bucket, key }) {
    return S3.getObject({ Bucket: bucket, Key: key }).createReadStream();
  }

  async checkKey({ bucket, key }) {
    try {
      const data = await S3.headObject({ Bucket: bucket, Key: key }).promise();
      console.log("Key was", data);
      return true;
    } catch (error) {
      console.log("error return a object with status code 404");
      return false;
    }
  }

  writeStream({ bucket, key, contentType }) {
    const passThrough = new stream.PassThrough();
    return {
      writeStream: passThrough,
      uploaded: S3.upload({
        ContentType: `${contentType}`,
        Body: passThrough,
        Bucket: bucket,
        Key: key,
        ACL: "public-read",
      }).promise(),
    };
  }
  async uploadToS3(file, folder = "uploads") {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error("No file provided"));
      }

      const uploadParams = {
        Bucket: envs.s3.BUCKET_NAME,
        Key: `${folder}`,
        Body: file.data,
        ContentType: file.mimetype,
        ACL: "public-read", // Change to "private" if needed
      };

      S3.upload(uploadParams, (err, data) => {
        if (err) reject(err);
        else resolve(data.Location);
      });
    });
  }
}

export const s3Handler = new S3Handler();
