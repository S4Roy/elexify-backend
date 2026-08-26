import axios from "axios";
import { resolvePincode } from "../../../services/shipping/resolvePincode.js";
import { StatusError } from "../../../config/index.js";

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

    const line1 = [address.house_number, address.road]
      .filter(Boolean)
      .join(" ");
    const line2 = [
      address.suburb || address.neighbourhood,
      address.city_district,
    ]
      .filter(Boolean)
      .join(", ");

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
      },
    });
  } catch (error) {
    next(error);
  }
};
