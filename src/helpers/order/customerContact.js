// Historical billing details belong to the order, not to a newly inferred account.
export function customerContact(order) {
  const billing = order.billing_address_snapshot || {};
  const shipping = order.shipping_address_snapshot || {};
  return {
    account_status: order.user?._id ? 'linked' : order.customer_account_expected === false ? 'guest' : 'unavailable',
    name: billing.full_name || shipping.full_name || null,
    email: billing.email || shipping.email || null,
    phone: billing.phone || shipping.phone || null,
    phone_code: billing.phone_code || shipping.phone_code || null,
  };
}
