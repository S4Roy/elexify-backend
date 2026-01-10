import bcrypt from "bcrypt";

export const bcryptCheck = async (string, hash) => {
  if (!string || !hash) return false;
  return bcrypt.compareSync(string, hash);
};
