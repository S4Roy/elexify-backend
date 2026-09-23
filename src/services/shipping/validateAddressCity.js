import City from "../../models/City.js";
import { StatusError } from "../../config/index.js";

export const CITY_MAX_LENGTH = 40;
export const CITY_LENGTH_MESSAGE = "City must be 40 characters or fewer. Put locality and landmark details in address line 2.";
export const normalizeCityName = value => String(value || "").trim().replace(/\s+/g, " ");

export const assertCityName = value => {
  const name = normalizeCityName(value);
  if (!name) throw StatusError.badRequest("City is required");
  if (name.length > CITY_MAX_LENGTH) throw StatusError.badRequest(CITY_LENGTH_MESSAGE);
  return name;
};

// Returns the denormalized display names (already carried on the City
// record alongside its own name) so callers can store city_name/state_name/
// country_name on the address in the same query, instead of leaving them
// blank — a blank state_name breaks downstream address snapshots (see
// snapshotAddress.js) and Zoho state_code resolution.
export const validateAddressCity = async (city, state, country) => {
  const location = await City.findOne({ id: city, state_id: state, country_id: country, status: "active" }).lean();
  if (!location) throw StatusError.badRequest("Select a city belonging to the selected state and country");
  return {
    city_name: assertCityName(location.name),
    state_name: location.state_name || null,
    country_name: location.country_name || null,
  };
};
