import { convert } from "url-slug";

/**
 * Generates a normalized key (e.g., "Mukhi Count" → "mukhi_count").
 * If regenerate=true, increments numeric suffix.
 *
 * @param {string} keyName - Input key/label.
 * @param {boolean} [regenerate=false] - Whether to regenerate with increment.
 * @returns {string}
 */
export const generateKeyName = (keyName, regenerate = false) => {
  if (!keyName) return "";

  let baseKey = convert(keyName, {
    separator: "_", // underscore instead of hyphen
    transform: "lowercase", // ✅ correct option
  });

  if (regenerate) {
    const match = baseKey.match(/_(\d+)$/); // Find trailing number
    const number = match ? parseInt(match[1], 10) + 1 : 1;
    return baseKey.replace(/_\d+$/, "") + `_${number}`;
  }

  return baseKey;
};
