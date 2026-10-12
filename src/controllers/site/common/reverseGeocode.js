import { StatusError } from "../../../config/index.js";
import { reverseGeocodeLocation } from "../../../services/location/reverseGeocodeLocation.js";

// "Use current location" on the address form: the app/browser sends lat/lng;
// see services/location/reverseGeocodeLocation.js.
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

    const result = await reverseGeocodeLocation(lat, lng);
    if (!result) {
      return res.status(200).json({
        status: "success",
        message: "Couldn't determine your location",
        data: { found: false, serviceable: false },
      });
    }
    const { resolved, line1, line2, suggestedCityName } = result;

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
