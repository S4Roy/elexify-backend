import ShippingZone from "../../models/ShippingZone.js";

/**
 * Resolve the best-matching shipping zone for a destination.
 * Priority: pincode prefix override > state match > country match > default zone.
 * @param {{country?: number, state?: number, postcode?: string}} destination
 * @returns {Promise<import("mongoose").Document|null>}
 */
export const resolveZone = async ({ country, state, postcode } = {}) => {
  const zones = await ShippingZone.find({
    status: "active",
    deleted_at: null,
  }).lean();

  if (!zones.length) return null;

  if (postcode) {
    const prefixMatch = zones.find(
      (z) =>
        Array.isArray(z.pincode_prefixes) &&
        z.pincode_prefixes.length > 0 &&
        z.pincode_prefixes.some((prefix) => String(postcode).startsWith(prefix))
    );
    if (prefixMatch) return prefixMatch;
  }

  if (state) {
    const stateMatch = zones.find(
      (z) =>
        Array.isArray(z.states) &&
        z.states.length > 0 &&
        z.states.includes(state) &&
        (!Array.isArray(z.countries) ||
          z.countries.length === 0 ||
          !country ||
          z.countries.includes(country))
    );
    if (stateMatch) return stateMatch;
  }

  if (country) {
    const countryMatch = zones.find(
      (z) =>
        Array.isArray(z.countries) &&
        z.countries.length > 0 &&
        z.countries.includes(country) &&
        (!Array.isArray(z.states) || z.states.length === 0)
    );
    if (countryMatch) return countryMatch;
  }

  const defaultZone = zones.find((z) => z.is_default);
  return defaultZone || null;
};
