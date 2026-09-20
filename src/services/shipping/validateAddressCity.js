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

export const validateAddressCity = async (city, state, country) => {
  const location = await City.findOne({ id: city, state_id: state, country_id: country, status: "active" }).lean();
  if (!location) throw StatusError.badRequest("Select a city belonging to the selected state and country");
  return assertCityName(location.name);
};
