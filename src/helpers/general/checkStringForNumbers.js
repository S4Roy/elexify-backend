/**
 * checkStringForNumbers
 * check in a string any number is present or not
 * @param charText
 * if number is present return true or false
 * @return boolean
 */
export const checkStringForNumbers = async (charText) => {
  const str = String(charText);
  const regExp = /[0-9]+/;
  let retStr = false;
  if (regExp.test(str)) {
    retStr = true;
  }
  return retStr;
};
