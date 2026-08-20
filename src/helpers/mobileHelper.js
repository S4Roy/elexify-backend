/**
 * Normalizes a raw mobile number input into a bare national number with
 * no "+", no country code prefix, and no whitespace — since phone_code
 * is stored as its own separate field. This keeps a single canonical
 * string representation per number, so the same phone can't be stored
 * as "+916376279486", "916376279486" and "6376279486" simultaneously
 * (which defeats the unique index and creates duplicate accounts).
 *
 * Currently assumes Indian 10-digit mobile numbers (phone_code "91").
 * Extend the STT_LENGTHS map if you support other country codes.
 */

const NATIONAL_LENGTH_BY_CODE = {
  91: 10, // India
};

/**
 * @param {string} rawMobile - raw user input, e.g. "+91 6376279486", "916376279486", " 6376279486 "
 * @param {string} phoneCode - e.g. "91" (no "+")
 * @returns {string|null} normalized bare mobile number, or null if it doesn't validate
 */
export const normalizeMobile = (rawMobile, phoneCode = "91") => {
  if (!rawMobile) return null;

  const code = String(phoneCode).replace(/\D/g, "");
  const nationalLength = NATIONAL_LENGTH_BY_CODE[code] ?? 10;

  // strip everything except digits (kills spaces, dashes, "+", parens, etc.)
  let cleaned = String(rawMobile).replace(/\D/g, "");

  // strip a leading country code if the string is longer than the
  // expected national length and starts with it
  if (
    cleaned.length === code.length + nationalLength &&
    cleaned.startsWith(code)
  ) {
    cleaned = cleaned.slice(code.length);
  }

  // strip a single leading domestic trunk "0" (e.g. "09835073750")
  if (cleaned.length === nationalLength + 1 && cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length !== nationalLength) {
    return null;
  }

  return cleaned;
};

/**
 * @param {string} rawMobile
 * @param {string} phoneCode
 * @returns {boolean}
 */
export const isValidMobile = (rawMobile, phoneCode = "91") =>
  normalizeMobile(rawMobile, phoneCode) !== null;
