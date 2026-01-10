export const maskString = async (text, length, format = "*") => {
  const replacer = format.repeat(length);
  return replacer.concat(text.slice(length));
};
