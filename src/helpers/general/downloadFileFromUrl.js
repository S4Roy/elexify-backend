import axios from "axios";
import https from "https";
import fs from "fs";

/**
 * downloadFileFromUrl by url
 * @param destinationPath
 * @param urlPath
 */
export const downloadFileFromUrl = async (destinationPath, urlPath) => {
  try {
    if (destinationPath && urlPath) {
      if (!fs.existsSync(destinationPath)) {
        const agent = new https.Agent({
          rejectUnauthorized: false,
        });
        const axiosConfig = {
          method: "get",
          url: `${urlPath}`,
          httpsAgent: agent,
          responseType: "stream",
        };
        return await axios(axiosConfig).then((results) => {
          if (results) {
            if (results.data) {
              const wstream = fs.createWriteStream(destinationPath);
              results.data.pipe(wstream);
            }
          }
        });
      }
      return destinationPath;
    } else {
      return "";
    }
  } catch (error) {
    return "";
  }
};
