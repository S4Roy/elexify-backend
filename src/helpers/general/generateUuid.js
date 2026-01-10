export const uuidv4 = async (format = null) => {
  const defalt = format === null ? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx" : format;
  return defalt.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
