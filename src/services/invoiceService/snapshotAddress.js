// Plain-object snapshot of an Address document's display fields — used both
// at order-placement time (Order.billing_address_snapshot/
// shipping_address_snapshot) and as a fallback at invoice-generation time
// for orders placed before those snapshot fields existed.
export const snapshotAddress = (address) => {
  if (!address) return null;
  return {
    full_name: address.full_name || null,
    phone_code: address.phone_code || null,
    phone: address.phone || null,
    email: address.email || null,
    address_line_1: address.address_line_1 || null,
    address_line_2: address.address_line_2 || null,
    land_mark: address.land_mark || null,
    city: address.city_name || null,
    state: address.state_name || null,
    country: address.country_name || null,
    postcode: address.postcode || null,
  };
};
