import { customFileHelper } from "../../helpers/index.js";
import { s3Handler } from "./s3Handler.js";
import { envs } from "../../config/index.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

export const s3ImageResize = async ({ size, path, url, height, width }) => {
  try {
    const bucket = envs.s3.BUCKET_NAME;
    width = parseInt(width);
    height = parseInt(height);
    const key = path;
    const [getFileExtByFileName, getFileName] = await Promise.all([
      customFileHelper.getFileExtByFileName(url),
      customFileHelper.getFileNameFromUrl(url),
    ]);
    const fileFormat = getFileExtByFileName ? getFileExtByFileName : "png";
    const contentType = `image/${getFileExtByFileName}`;
    const streamResize = sharp().resize(width, height).toFormat(fileFormat);
    const newKey = `${path}/${size}/${getFileName}`;
    const [isKey, isNewKey] = await Promise.all([
      s3Handler.checkKey({ bucket, key }),
      s3Handler.checkKey({ bucket, key: newKey }),
    ]);
    if (isNewKey === false) {
      let readStream = "";
      if (isKey === false) {
        console.log("url", url);
        readStream = await customFileHelper.createStreamData(url);
      } else {
        readStream = s3Handler.readStream({ bucket, key });
      }
      const { writeStream, uploaded } = s3Handler.writeStream({ bucket, key: newKey, contentType });

      readStream.pipe(streamResize).pipe(writeStream);

      await uploaded;
    }
    return `${envs.s3.BUCKET_URL}/${newKey}`;
  } catch (error) {
    console.log(error);
    return "";
  }
};
