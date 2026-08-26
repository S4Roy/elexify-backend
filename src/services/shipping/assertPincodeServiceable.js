import Pincode from "../../models/Pincode.js";
import { StatusError } from "../../config/index.js";

const INDIA_COUNTRY_ID = 101;

// Enforces the admin's pincode include/exclude list (Pincode.status) at the
// point an address is actually saved — the storefront's auto-fill lookup is
// just a UX hint, this is what actually blocks it. Only checks India, since
// that's the only pincode data we have; other countries are left to the
// country-level active/inactive switch.
export const assertPincodeServiceable = async (postcode, country) => {
  if (Number(country) !== INDIA_COUNTRY_ID || !postcode) return;

  const record = await Pincode.findOne({ pincode: postcode }).lean();
  if (record && record.status !== "active") {
    throw StatusError.badRequest(
      "We're sorry, we don't currently deliver to this pincode.",
    );
  }
};
