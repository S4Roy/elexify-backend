import City from '../../models/City.js';

// Plain-object snapshot of an Address document's display fields — used both
// at order-placement time (Order.billing_address_snapshot/
// shipping_address_snapshot) and as a fallback at invoice-generation time
// for orders placed before those snapshot fields existed.
//
// Some addresses (older self-service ones, before address/add.js and
// address/edit.js started denormalizing location names) only carry the
// numeric city/state/country IDs with no *_name fields. Falling back to
// city_name/state_name/country_name = null silently drops the customer's
// state from the snapshot, which then breaks Zoho state_code resolution
// (see resolveCustomerAddress.js) and mis-defaults "State of Supply".
export const snapshotAddress = async (address) => {
  if (!address) return null;
  let { city_name, state_name, country_name } = address;
  if ((!city_name || !state_name || !country_name) && address.city && address.state && address.country) {
    const location = await City.findOne({ id: address.city, state_id: address.state, country_id: address.country }).lean();
    city_name ||= location?.name || null;
    state_name ||= location?.state_name || null;
    country_name ||= location?.country_name || null;
  }
  return {
    full_name: address.full_name || null,
    phone_code: address.phone_code || null,
    phone: address.phone || null,
    email: address.email || null,
    address_line_1: address.address_line_1 || null,
    address_line_2: address.address_line_2 || null,
    land_mark: address.land_mark || null,
    city: city_name || null,
    state: state_name || null,
    country: country_name || null,
    postcode: address.postcode || null,
    ...(address.gstin ? { gstin: address.gstin } : {}),
    ...(address.gst_treatment ? { gst_treatment: address.gst_treatment } : {}),
  };
};
