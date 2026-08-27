import axios from "axios";
import { resolvePincode } from "../../../services/shipping/resolvePincode.js";
import { StatusError } from "../../../config/index.js";
import City from "../../../models/City.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCityCandidate = (value) =>
  String(value || "")
    .replace(/\b(metropolitan|metro)\s+(area|region)\b/gi, "")
    .replace(/\b(city|district|county)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

// "Use current location" on the address form: browser gives us lat/lng, we
// reverse-geocode server-side (OpenStreetMap Nominatim — free, no API key,
// but its usage policy requires a real User-Agent and forbids calling it
// directly from client JS, hence proxying here) to get a postcode, then run
// it through the same resolvePincode() the manual pincode field uses so the
// two flows always agree on serviceability/city/state.
export const reverseGeocode = async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw StatusError.badRequest("Invalid coordinates");
    }

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
    } catch (geocodeErr) {
      return res.status(200).json({
        status: "success",
        message: "Couldn't determine your location",
        data: { found: false, serviceable: false },
      });
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

    res.status(200).json({
      status: "success",
      message: resolved.found
        ? resolved.serviceable
          ? "Location resolved"
          : "This area is not currently serviceable"
        : "Couldn't match your location to a known pincode",
      data: {
        ...resolved,
        suggested_address_line_1: line1 || null,
        suggested_address_line_2: line2 || null,
        suggested_city_name: suggestedCityName,
        latitude: lat,
        longitude: lng,
      },
    });
  } catch (error) {
    next(error);
  }
};
