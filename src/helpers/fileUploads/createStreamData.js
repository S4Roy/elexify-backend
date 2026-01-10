import axios from "axios";
import https from "https";

/**
 * createStreamData by url
 * @param urlPath
 */
export const createStreamData = async (urlPath) => {
  try {
    if (urlPath) {
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
            return results.data;
          } else {
            return "";
          }
        } else {
          return "";
        }
      });
    } else {
      return "";
    }
  } catch (error) {
    return "";
  }
};
