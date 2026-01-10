import axios from "axios";

/**
 * checkLinkFileType
 * @param link
 */
export const checkLinkFileType = async (link) => {
  try {
    const response = await axios.head(link); // Send a HEAD request to get the headers
    const contentType =
      response && response.headers["content-type"] ? response.headers["content-type"] : "";
    let retResult = false;
    // Check if the Content-Type header indicates it's an image
    if (contentType && contentType.startsWith("image/")) {
      retResult = true;
      console.log(`The link ${link} points to an image.`);
    } else {
      retResult = false;
      console.log(`The link ${link} points to a file with Content-Type: ${contentType}`);
    }

    return retResult;
  } catch (error) {
    console.log("checkLinkFileType error", error);
    return false;
  }
};
