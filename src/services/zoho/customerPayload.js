const location = (value, fallback) => typeof value === 'string' && value.trim() && !/^\d+$/.test(value) ? value : value?.name || fallback || '';

export const zohoAddress = (address = {}) => ({
  attention: address.full_name || '',
  address: address.address_line_1 || '',
  street2: address.address_line_2 || '',
  city: location(address.city, address.city_name),
  state: location(address.state, address.state_name),
  ...(address.state_code ? { state_code: address.state_code } : {}),
  country: location(address.country, address.country_name),
  zip: address.postcode || '',
  phone: address.phone ? `${address.phone_code ? '+' + address.phone_code : ''}${address.phone}` : '',
});

export const customerPayload = (user, invoice, identity) => {
  const address = invoice.billing_address || {};
  const name = String(user?.name || address.full_name || 'Customer').trim();
  // Display the customer name; stable identity remains in mappings and notes.
  const contactName = name;
  const [firstName, ...lastName] = name.split(/\s+/);
  return {
    contact_name: contactName,
    contact_type: 'customer', customer_sub_type: 'individual',
    ...((address.country_code === 'IN' || location(address.country, address.country_name) === 'India') ? {
      gst_treatment: address.gstin ? 'business_gst' : user?.gst_treatment || address.gst_treatment || 'consumer',
      ...(address.state_code ? { place_of_contact: address.state_code } : {}),
    } : {}),
    billing_address: zohoAddress(address),
    shipping_address: zohoAddress(invoice.shipping_address || address),
    contact_persons: [{ first_name: firstName.slice(0, 100), last_name: lastName.join(' ').slice(0, 100),
      ...(user?.email || address.email ? { email: user?.email || address.email } : {}),
      ...(user?.mobile || address.phone ? { mobile: user?.mobile || address.phone } : {}),
      is_primary_contact: true,
    }],
    notes: `${name} — Elexify customer ${identity}`,
  };
};
