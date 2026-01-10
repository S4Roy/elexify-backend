import path from "path";

export const getFileExtByFileName = async (fileName) => {
  let retStr = "";
  if (fileName) {
    if (typeof fileName != "string") {
      fileName = fileName.toString();
    }
    const getExt = path.extname(fileName);
    if (getExt) {
      retStr = getExt.replace(".", "");
    }
  }

  return retStr;
};
