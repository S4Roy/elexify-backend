import path from "path";
import { URL } from "url";
import { customFileHelper } from "../../helpers/index.js";

function removeQueryParametersFromLink(link) {
  const parsedUrl = new URL(link);
  if (!/\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(parsedUrl.search)) {
    parsedUrl.search = "";
  }
  return parsedUrl.toString();
}
function removeAmp(link) {
  const newLink = link.replace("amp;", "");
  const parsedNewLink = new URL(newLink);
  const queryParameters = new URLSearchParams(parsedNewLink.search);
  const parsedLink = Object.fromEntries(queryParameters);
  let retFormatExt = "";
  if (parsedLink && parsedLink.format) {
    retFormatExt = parsedLink.format;
  } else if (parsedLink && parsedLink.fname) {
    const extname = path.extname(parsedLink.fname);
    if (extname) {
      retFormatExt = extname.slice(1).toLowerCase();
    }
  }
  return retFormatExt;
}
function getImageExtension(link) {
  const url = removeQueryParametersFromLink(link);
  const extname = path.extname(url);
  let retExt = "";
  if (extname) {
    retExt = extname.slice(1).toLowerCase();
  } else {
    retExt = removeAmp(link);
  }
  return retExt;
}
export const isImageURL = async (url) => {
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]; // Add more image extensions as needed
  const extension = getImageExtension(url);
  let retRes = false;
  if (imageExtensions.includes(extension)) {
    retRes = true;
  } else {
    retRes = await customFileHelper.checkLinkFileType(url);
  }
  return retRes;
};
