import moment from "moment-timezone";
import { StatusError, envs } from "../../../config/index.js";
import { packageReference } from "./packageReference.js";

// Builds the Shiprocket adhoc-order payload for one package, scoped to just
// this package's items/weight/dims, with a package-unique `order_id` so each
// package is a distinct Shiprocket order.
//
// Amounts: Shiprocket's order total (and, for COD, the amount the courier
// collects) is sub_total + shipping + giftwrap + transaction − total_discount.
// sub_total is always the real value of the package's line items, so the
// items and "Product Total" in Shiprocket agree. Whatever the customer does
// not pay on delivery — coupon discount and, for Partial COD, the online
// advance already paid — goes in total_discount, so the total comes out to
// exactly the amount due. (It used to be solved backwards into sub_total,
// which made the product total disagree with the items it listed.)
//
// COD amount split: for a Partial-COD or full-COD order shipped across
// multiple packages, each package collects a share of the COD-due amount
// proportional to the value of the items it carries — the standard
// approach for multi-parcel COD (each courier collects its own share).
// Amounts are rounded per package (may be off by a few cents across
// packages in total, which is an acceptable, common real-world rounding
// tolerance for cash-on-delivery collection).
// Address refs can disappear or be incomplete after placement. Prefer the
// live address, then the order-time snapshot, then the shipping address.
export const resolveBillingAddress = (order_data) => {
  const billingCandidates = [
    order_data.billing_address,
    order_data.billing_address_snapshot,
    order_data.shipping_address,
    order_data.shipping_address_snapshot,
  ];
  return billingCandidates.find((address) => address?.address_line_1?.trim()) || null;
};

export const buildPackagePayload = ({ order_data, shiprocketConfig, pkg, pickupLocation, dims }) => {
  const billing = resolveBillingAddress(order_data) || {};
  const shippingAddr = [order_data.shipping_address, order_data.shipping_address_snapshot]
    .find((address) => address?.address_line_1?.trim()) || billing;
  const placeName = (value, fallback) =>
    (typeof value === "object" ? value?.name : typeof value === "string" ? value : null) || fallback || "";
  const shippingEmpty =
    !shippingAddr || !shippingAddr.address_line_1 || !placeName(shippingAddr.city, shippingAddr.city_name) || !shippingAddr.postcode;
  const shipping_is_billing = !!order_data.shipping_is_billing;

  const allOrderItems = order_data.order_items || [];
  const packageItemIds = new Set(pkg.items.map((line) => String(line.order_item_id)));
  const quantityByItemId = new Map(pkg.items.map((line) => [String(line.order_item_id), line.quantity]));
  const packageOrderItems = allOrderItems.filter((item) => packageItemIds.has(String(item._id)));

  const wholeOrderItemsValue = allOrderItems.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0,
  );
  const packageItemsValue = packageOrderItems.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * (quantityByItemId.get(String(item._id)) || 0),
    0,
  );
  const packageShare = wholeOrderItemsValue > 0 ? packageItemsValue / wholeOrderItemsValue : 0;

  const codCollectibleAmount = Number(
    order_data.is_partial_cod
      ? order_data.cod_due_amount
      : order_data.grand_total || order_data.sub_total || order_data.subtotal || 0,
  );
  // COD handling is a separate stored charge already included in grand_total.
  // Shiprocket receives it as shipping, so never add it to the collectible again.
  const shippingChargesValue = Number(order_data.shipping_charges ?? order_data.shipping ?? 0)
    + Number(order_data.cod_fee || 0);
  const giftwrapChargesValue = Number(order_data.giftwrap_charges || 0);
  const transactionChargesValue = Number(order_data.transaction_charges || 0);
  const discountValue = Number(order_data.discount || 0);

  // Whole-order amounts, split proportionally across packages by item value.
  const scale = (value) => Number((value * packageShare).toFixed(2));

  const round2 = (value) => Number(Number(value).toFixed(2));
  const packageCodCollectible = scale(codCollectibleAmount);
  const packageShippingCharges = scale(shippingChargesValue);
  const packageGiftwrapCharges = scale(giftwrapChargesValue);
  const packageTransactionCharges = scale(transactionChargesValue);
  const packageDiscount = scale(discountValue);

  const payload_items = packageOrderItems.map((item) => ({
    name: item.display_name || item.name,
    sku: item.sku || (item.product && item.product.sku) || `SKU-${item.product_id || item._id}`,
    units: Number(quantityByItemId.get(String(item._id)) || 0),
    selling_price: Number(item.unit_price || item.selling_price || item.price || 0),
    discount: item.discount || "",
    tax: item.tax || "",
    hsn: item.hsn || "",
  }));
  const packageItemsTotal = round2(payload_items.reduce((sum, i) => sum + i.selling_price * i.units, 0));
  const packageCharges = packageShippingCharges + packageGiftwrapCharges + packageTransactionCharges;
  // What Shiprocket's total must equal for this package: the COD amount the
  // courier collects, or (prepaid) this package's share of the order total.
  const packageTarget = packageCodCollectible;
  let packageSubTotal = packageItemsTotal;
  let packageTotalDiscount = round2(packageItemsTotal + packageCharges - packageTarget);
  if (packageTotalDiscount < 0) {
    // The order total exceeds items + charges (e.g. a charge not modelled
    // here). Never send a negative discount — carry the difference in
    // sub_total so the collectible stays exact.
    console.warn(
      `Shiprocket payload ${order_data.id}-P${pkg.package_number}: order total exceeds items + charges by ${-packageTotalDiscount}; adding it to sub_total`,
    );
    packageSubTotal = round2(packageItemsTotal - packageTotalDiscount);
    packageTotalDiscount = 0;
  }
  const packageAdvance = round2(Math.max(0, packageTotalDiscount - packageDiscount));
  const isCod = String(order_data.payment_method || "Prepaid").toLowerCase().includes("cod");
  const note = order_data.note || order_data.comment || "";
  const partialCodNote =
    isCod && order_data.is_partial_cod && packageAdvance > 0
      ? `Partial COD: order value Rs ${round2(packageItemsTotal + packageCharges - packageDiscount).toFixed(2)}, advance Rs ${packageAdvance.toFixed(2)} paid online (entered as discount so the courier collects only the balance). Collect Rs ${packageTarget.toFixed(2)}.`
      : "";

  const payload = {
    order_id: packageReference(order_data.id, pkg.package_number),
    order_date: moment(order_data.created_at || new Date()).tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm"),
    pickup_location: (pickupLocation && String(pickupLocation).trim()) || shiprocketConfig.pickup_location || envs.PROJECT_NAME,
    ...(shiprocketConfig.channel_id ? { channel_id: shiprocketConfig.channel_id } : {}),
    comment: [note, partialCodNote].filter(Boolean).join(" | "),
    billing_customer_name: billing.full_name || shippingAddr.full_name || order_data.user?.name || "",
    billing_last_name: billing.last_name || "",
    billing_address: billing.address_line_1 || "",
    billing_address_2: billing.address_line_2 || "",
    billing_city: placeName(billing.city, billing.city_name),
    billing_pincode: String(billing.postcode || ""),
    billing_state: placeName(billing.state, billing.state_name),
    billing_country: placeName(billing.country, billing.country_name) || "India",
    billing_email: billing.email || order_data.user?.email || "",
    billing_phone: String(billing.phone || shippingAddr.phone || ""),
    shipping_is_billing: true,
    shipping_customer_name: "",
    shipping_last_name: "",
    shipping_address: "",
    shipping_address_2: "",
    shipping_city: "",
    shipping_pincode: "",
    shipping_state: "",
    shipping_country: "",
    shipping_email: "",
    shipping_phone: "",
    order_items: payload_items,
    payment_method: isCod ? "COD" : "Prepaid",
    shipping_charges: packageShippingCharges,
    giftwrap_charges: packageGiftwrapCharges,
    transaction_charges: packageTransactionCharges,
    total_discount: packageTotalDiscount,
    sub_total: packageSubTotal,
    length: String(Math.round(dims.length)),
    breadth: String(Math.round(dims.width)),
    height: String(Math.round(dims.height)),
    weight: String(Number(dims.weight).toFixed(2)),
  };

  if (!shipping_is_billing && !shippingEmpty) {
    payload.shipping_is_billing = false;
    payload.shipping_customer_name = shippingAddr.full_name || payload.billing_customer_name;
    payload.shipping_last_name = shippingAddr.last_name || "";
    payload.shipping_address = shippingAddr.address_line_1 || payload.billing_address;
    payload.shipping_address_2 = shippingAddr.address_line_2 || "";
    payload.shipping_city = placeName(shippingAddr.city, shippingAddr.city_name) || payload.billing_city;
    payload.shipping_pincode = String(shippingAddr.postcode || payload.billing_pincode);
    payload.shipping_state = placeName(shippingAddr.state, shippingAddr.state_name) || payload.billing_state;
    payload.shipping_country = placeName(shippingAddr.country, shippingAddr.country_name) || payload.billing_country;
    payload.shipping_email = shippingAddr.email || payload.billing_email;
    payload.shipping_phone = String(shippingAddr.phone || payload.billing_phone);
  }

  // Shiprocket rejects city values longer than 40 characters. Keep the
  // complete locality on the shipping label without changing the saved address.
  for (const prefix of ["billing", "shipping"]) {
    const city = payload[`${prefix}_city`].trim().replace(/\s+/g, " ");
    const characters = Array.from(city);
    payload[`${prefix}_city`] = characters.slice(0, 40).join("").trimEnd();
    if (characters.length > 40) {
      payload[`${prefix}_address_2`] = [payload[`${prefix}_address_2`], city].filter(Boolean).join(", ");
    }
  }

  return payload;
};

// Default physical weight: product weights of only the units in this package.
export const calculatePackageWeight = items => {
  return Number(items.reduce((total, item) => {
    const weight = Number(item.variation?.weight ?? item.product?.weight ?? item.weight);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw StatusError.badRequest(`Set a positive product weight for ${item.sku || item.product_name || item._id} before packing.`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) throw StatusError.badRequest('Package quantity must be a positive whole number');
    return total + weight * quantity;
  }, 0).toFixed(6));
};

export const resolvePackageDims = ({ qWeight, qLength, qWidth, qHeight, packageOrderItems }) => {
  const lengthNum = qLength ? Number(qLength) : null;
  const widthNum = qWidth ? Number(qWidth) : null;
  const heightNum = qHeight ? Number(qHeight) : null;
  const weightNum = qWeight ? Number(qWeight) : null;
  if (weightNum !== null && !(Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 1000)) {
    throw StatusError.badRequest('Package weight must be between 0 and 1000 kg');
  }

  const volumetricFromQuery = lengthNum && widthNum && heightNum ? (lengthNum * widthNum * heightNum) / 5000.0 : 0;

  let totalVolWeightFromProducts = 0;
  if (!volumetricFromQuery && Array.isArray(packageOrderItems)) {
    for (const it of packageOrderItems) {
      const prod = it.product || it.product_doc || {};
      const dims = prod.dimensions || {};
      const l = Number(dims.length || dims.l || 0) || 0;
      const w = Number(dims.width || dims.w || 0) || 0;
      const h = Number(dims.height || dims.h || 0) || 0;
      if (l && w && h) totalVolWeightFromProducts += ((l * w * h) / 5000.0) * (it.quantity || it.units || 1);
    }
  }

  const DEFAULT_WEIGHT = Number(process.env.DEFAULT_WEIGHT_KG || 0.5);
  const DEFAULT_DIM = Number(process.env.DEFAULT_DIM_CM || 10);
  return {
    // The admin's weighed package wins; otherwise fall back to product weights.
    weight: weightNum || (packageOrderItems?.length ? calculatePackageWeight(packageOrderItems)
      : volumetricFromQuery || totalVolWeightFromProducts || DEFAULT_WEIGHT),
    length: lengthNum || DEFAULT_DIM,
    width: widthNum || DEFAULT_DIM,
    height: heightNum || DEFAULT_DIM,
  };
};

// Extracts the ids Shiprocket returns from its create-order response, same
// extraction shipping.js already used.
export const extractShiprocketIds = (createOrderResp) => {
  const respData = createOrderResp.data || {};
  const shiprocket_order_id = (respData.data && respData.data.order_id) || respData.order_id || null;
  const shiprocket_shipment_id =
    (respData.data && respData.data.shipment_id) || respData.shipment_id || null;
  const courier_name = (respData.data && respData.data.courier_name) || respData.courier_name || null;
  const awb = (respData.data && respData.data.awb_code) || respData.awb_code || null;
  return { shiprocket_order_id, shiprocket_shipment_id, courier_name, awb };
};
