import path from "path";

export const getFileNameFromUrl = async (fileName) => {
  let retStr = "";
  if (fileName) {
    if (typeof fileName != "string") {
      fileName = fileName.toString();
    }
    const getExt = path.extname(fileName);
    if (getExt) {
      retStr = fileName.split("/").pop();
    }
  }

  return retStr;
};
