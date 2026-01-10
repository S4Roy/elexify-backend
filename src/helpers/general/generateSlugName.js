import { convert } from "url-slug";

/**
 * Generates a unique slug name.
 * If `regenarate` is true, increments the number at the end of the slug.
 *
 * @param {string} slugName - The base slug string.
 * @param {boolean} [regenarate=false] - Whether to regenerate the slug.
 * @returns {string} - The generated slug.
 */
export const generateSlugName = (slugName, regenarate = false) => {
  if (!slugName) return "";

  if (regenarate) {
    const match = slugName.match(/-(\d+)$/); // Find trailing number
    const number = match ? parseInt(match[1], 10) + 1 : 1;
    return slugName.replace(/-\d+$/, "") + `-${number}`;
  }

  return convert(slugName, { separator: "-" }); // Correct usage
};
