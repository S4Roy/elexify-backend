import axios from "axios";
import { resolvePincode } from "../shipping/resolvePincode.js";
import City from "../../models/City.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCityCandidate = (value) =>
  String(value || "")
    .replace(/\b(metropolitan|metro)\s+(area|region)\b/gi, "")
    .replace(/\b(city|district|county)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

// Coordinates -> pincode/city/state via OpenStreetMap Nominatim (free, no
// key; its policy requires a real User-Agent and forbids calling it from
// client JS, hence server-side), then the same resolvePincode() the manual
// pincode field uses so every flow agrees on serviceability/city/state.
// Shared by "Use current location" (address form) and the customer's
// last-known-area tracking. Returns null when the geocoder is unreachable.
export const reverseGeocodeLocation = async (lat, lng) => {
  let address = {};
  try {
    const { data } = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "jsonv2",
          lat,
          lon: lng,
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "Elexify/1.0 (contact@elexify.online)",
          "Accept-Language": "en",
        },
        timeout: 6000,
      },
    );
    address = data?.address || {};
  } catch {
    return null;
  }

  const postcode = String(address.postcode || "").replace(/\D/g, "");
  const resolved = postcode
    ? await resolvePincode(postcode)
    : { pincode: postcode, found: false, serviceable: false };

  // Nominatim may return a valid delivery locality (for example "New
  // Town") that is intentionally more granular than our canonical City
  // master. Try progressively broader administrative names and map them to
  // an existing city ID; never create master data during checkout.
  if (!resolved.city && resolved.state?.id) {
    const candidates = [
      address.city,
      address.town,
      address.municipality,
      address.county,
      address.state_district,
    ]
      .flatMap((value) => [value, normalizeCityCandidate(value)])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const uniqueCandidates = [...new Set(candidates)];
    if (uniqueCandidates.length) {
      const canonicalCity = await City.findOne({
        state_id: resolved.state.id,
        status: "active",
        $or: uniqueCandidates.map((name) => ({
          name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
        })),
      })
        .select("id name")
        .lean();

      if (canonicalCity) {
        resolved.city = {
          id: canonicalCity.id,
          name: canonicalCity.name,
        };
      }
    }
  }

  const streetAddress = [address.house_number, address.road]
    .filter(Boolean)
    .join(" ");
  // GPS results frequently omit house_number/road (especially for large
  // complexes and New Town-style action areas). In that case promote the
  // most specific locality to required Address Line 1 rather than filling
  // only optional Address Line 2 and leaving the form invalid.
  const line1 =
    streetAddress ||
    address.building ||
    address.amenity ||
    address.residential ||
    address.neighbourhood ||
    address.suburb ||
    "";
  const line2 = [
    line1 === address.suburb || line1 === address.neighbourhood
      ? null
      : address.suburb || address.neighbourhood,
    address.city &&
    address.city.toLowerCase() !== resolved.city?.name?.toLowerCase()
      ? address.city
      : null,
    address.city_district,
  ]
    .filter(Boolean)
    .join(", ");

  const suggestedCityName =
    resolved.city?.name ||
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    address.county ||
    null;


  return { resolved, line1, line2, suggestedCityName };
};
