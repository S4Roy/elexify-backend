import ShippingSettings from "../../models/ShippingSettings.js";
import Pincode from "../../models/Pincode.js";

const ids = (values = []) => new Set(values.map(String));
const unavailable = (reason, code) => ({ eligible: false, fee: 0, reason, code });

/** Server-authoritative COD decision. Amounts are in the checkout currency. */
export const calculateCodEligibility = async ({
  items = [],
  address,
  orderAmount = 0,
  user,
  zone,
  exchangeRate = 1,
}) => {
  const settings = await ShippingSettings.getSingleton();
  if (!settings.cod_enabled) {
    return unavailable("Cash on Delivery is currently unavailable", "COD_DISABLED");
  }
  if (!address?.postcode) {
    return unavailable("Select a delivery address to check COD availability", "ADDRESS_REQUIRED");
  }

  const postcode = String(address.postcode).trim();
  const pincode = await Pincode.findOne({ pincode: postcode })
    .select("status cod_status note")
    .lean();
  if (!pincode || pincode.status !== "active") {
    return unavailable("Cash on Delivery is not available for this pincode", "PINCODE_UNSERVICEABLE");
  }
  if (pincode.cod_status === "disallowed") {
    return unavailable(pincode.note || "Cash on Delivery is not available for this pincode", "PINCODE_RESTRICTED");
  }
  const allowedPins = new Set(settings.cod_allowed_pincodes || []);
  const disallowedPins = new Set(settings.cod_disallowed_pincodes || []);
  if (
    pincode.cod_status !== "allowed" &&
    (disallowedPins.has(postcode) || (allowedPins.size && !allowedPins.has(postcode)))
  ) {
    return unavailable("Cash on Delivery is not available for this pincode", "PINCODE_RESTRICTED");
  }

  const categoryBlock = ids(settings.cod_disallowed_categories);
  const brandBlock = ids(settings.cod_disallowed_brands);
  const classBlock = ids(settings.cod_disallowed_shipping_classes);
  const zoneBlock = ids(settings.cod_disallowed_zones);
  if (zone?._id && zoneBlock.has(String(zone._id))) {
    return unavailable("Cash on Delivery is unavailable in this delivery zone", "ZONE_RESTRICTED");
  }
  if (settings.cod_allowed_customer_types?.length && !settings.cod_allowed_customer_types.includes(user?.role)) {
    return unavailable("Cash on Delivery is unavailable for this customer account", "CUSTOMER_RESTRICTED");
  }

  for (const item of items) {
    const product = item.product;
    const variation = item.variation;
    const effectiveStatus =
      variation?.cod_status && variation.cod_status !== "use_global"
        ? variation.cod_status
        : product?.cod_status;
    if (effectiveStatus === "disallowed" || variation?.prepaid_only || product?.prepaid_only) {
      return unavailable("One or more products require prepaid payment", "PRODUCT_RESTRICTED");
    }
    if (item.customization_id) {
      return unavailable("Cash on Delivery is unavailable for customised products", "CUSTOMIZATION_RESTRICTED");
    }
    if ((product?.categories || []).some((id) => categoryBlock.has(String(id)))) {
      return unavailable("One or more product categories require prepaid payment", "CATEGORY_RESTRICTED");
    }
    if (product?.brand && brandBlock.has(String(product.brand))) {
      return unavailable("One or more product brands require prepaid payment", "BRAND_RESTRICTED");
    }
    const shippingClass = variation?.shipping_class || product?.shipping_class;
    if (shippingClass && classBlock.has(String(shippingClass))) {
      return unavailable("Cash on Delivery is unavailable for this shipping class", "SHIPPING_CLASS_RESTRICTED");
    }
  }

  const min = Number(settings.cod_min_order || 0) * exchangeRate;
  const max = settings.cod_max_order == null ? null : Number(settings.cod_max_order) * exchangeRate;
  const limits = { min_order: min, max_order: max };
  if (orderAmount < min) {
    return {
      ...unavailable(`Cash on Delivery is available for orders of at least ₹${Number(settings.cod_min_order).toLocaleString("en-IN")}`, "BELOW_MINIMUM"),
      ...limits,
    };
  }
  if (max != null && max > 0 && orderAmount > max) {
    return {
      ...unavailable(`Cash on Delivery is available only for orders up to ₹${Number(settings.cod_max_order).toLocaleString("en-IN")}`, "ABOVE_MAXIMUM"),
      ...limits,
    };
  }

  const fee = settings.cod_charge_enabled
    ? Number((Number(settings.cod_charge || 0) * exchangeRate).toFixed(2))
    : 0;
  return { eligible: true, fee, reason: null, code: "ELIGIBLE", ...limits };
};
