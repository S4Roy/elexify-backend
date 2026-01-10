import bcrypt from "bcrypt";
import { envs } from "../../config/index.js";
export const bcryptMake = async (string) => {
  if (!string) return false;
  return bcrypt.hashSync(string, parseInt(10));
};
