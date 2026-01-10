import randomstring from "randomstring";

export const generateRandomAlphanumeric = async (length) => {
  const randomString = randomstring.generate(length);
  return randomString;
};
