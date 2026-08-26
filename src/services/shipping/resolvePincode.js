import Pincode from "../../models/Pincode.js";
import City from "../../models/City.js";
import State from "../../models/State.js";
import Country from "../../models/Country.js";

// Shared by the direct pincode-lookup endpoint and reverse-geocode (current
// location) endpoint — both ultimately need "given a 6-digit pincode, is it
// serviceable and what's the city/state/country". `status: inactive` on the
// Pincode row is the admin's include/exclude switch (Settings > Pincodes).
export const resolvePincode = async (pincode) => {
  if (!/^\d{6}$/.test(pincode)) {
    return { pincode, found: false, serviceable: false };
  }

  const record = await Pincode.findOne({ pincode }).lean();

  if (!record) {
    return { pincode, found: false, serviceable: false };
  }

  if (record.status !== "active") {
    return { pincode, found: true, serviceable: false };
  }

  const [city, state, country] = await Promise.all([
    record.city_id
      ? City.findOne({ id: record.city_id }).select("id name").lean()
      : null,
    record.state_id
      ? State.findOne({ id: record.state_id }).select("id name").lean()
      : null,
    Country.findOne({ id: record.country_id }).select("id name").lean(),
  ]);

  return {
    pincode,
    found: true,
    serviceable: true,
    city: city ? { id: city.id, name: city.name } : null,
    state: state ? { id: state.id, name: state.name } : null,
    country: country ? { id: country.id, name: country.name } : null,
  };
};
