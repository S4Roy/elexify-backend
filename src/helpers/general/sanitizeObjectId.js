import mongoose from "mongoose";

/**
 * Sanitizes a value to a valid ObjectId or returns `undefined`.
 * @param {string|null|undefined} value
 * @returns {mongoose.Types.ObjectId|undefined}
 */
export const sanitizeObjectId = (value) => {
  if (
    value &&
    typeof value === "string" &&
    mongoose.Types.ObjectId.isValid(value)
  ) {
    return new mongoose.Types.ObjectId(value);
  }
  return undefined;
};
