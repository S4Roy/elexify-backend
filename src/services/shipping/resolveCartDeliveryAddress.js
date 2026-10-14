import Address from "../../models/Address.js";
import { resolvePincode } from "./resolvePincode.js";

// Saved addresses belong to the signed-in customer; cart previews only need
// the location from our India pincode master, never another customer's address.
export const resolveCartDeliveryAddress = async ({ user_id, address_id, postcode }) => {
  if (address_id) {
    if (!user_id) return null;
    return Address.findOne({ _id: address_id, deleted_at: null, user: user_id }).lean();
  }
  if (!postcode) return null;
  const location = await resolvePincode(postcode);
  if (!location.serviceable || location.country?.id !== 101 || !location.state?.id) return null;
  return { postcode, country: location.country.id, state: location.state.id };
};
