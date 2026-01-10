export const getFormatedDateFromString = async (dateString, separator = "-") => {
  let retStr = "";
  if (dateString) {
    retStr = dateString.replace(/(\d{4})(\d{2})(\d{2})/, `$1${separator}$2${separator}$3`);
  }
  return retStr;
};
