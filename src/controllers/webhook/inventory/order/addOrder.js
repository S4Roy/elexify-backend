import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import Country from "../../../../models/Country.js";
import State from "../../../../models/State.js";
import City from "../../../../models/City.js";
import { StatusError } from "../../../../config/index.js";
import { zohoService, orderService } from "../../../../services/index.js";
import { derivePaymentStatus } from "../../../../helpers/order/derivePaymentStatus.js";
import { snapshotAddress } from "../../../../services/invoiceService/snapshotAddress.js";
import { normalizeOrderStatus } from "../../../../helpers/order/normalizeOrderStatus.js";

export const addOrder = async (req, res, next) => {
  try {
    const {
      order_id,
      created_at,
      updated_at,
      status,
      total,
      currency,
      discount,
      shipping,
      customer,
      billing_address,
      shipping_address,
      payment_method,
      transaction_id,
      payment_meta,
      items,
    } = req.body;
    const normalizedStatus = normalizeOrderStatus(status);
    if (!normalizedStatus) throw StatusError.badRequest("Unsupported order status");

    console.log(`🚀 Received order: ${order_id}`);

    // 🔒 1. Prevent duplicate order
    const existingOrder = await Order.findOne({ id: order_id });
    if (existingOrder) {
      console.warn(`⚠️ Duplicate order attempt: ${order_id}`);
      const updatePayload = {
        order_status: normalizedStatus,
        payment_status: derivePaymentStatus(status),
      };
      // Only overwrite with real values — a retry that couldn't find
      // gateway meta this time shouldn't clobber a good value from before.
      if (transaction_id) updatePayload.transaction_id = transaction_id;
      if (payment_meta && Object.keys(payment_meta).length) {
        updatePayload.payment_meta = payment_meta;
      }

      // Some orders were previously persisted with zero matched line items
      // (see resolveOrderItems below for why) and every retry of this same
      // webhook used to just no-op the status update forever. If items are
      // still missing and this payload has some, try to backfill them now.
      const existingItemCount = await OrderItem.countDocuments({
        order_id: existingOrder._id,
      });
      if (existingItemCount === 0 && Array.isArray(items) && items.length) {
        const orderItems = await resolveOrderItems(existingOrder._id, items);
        if (orderItems.length) {
          await OrderItem.insertMany(orderItems);

          const totalAmount = parseFloat(total ?? 0);
          const discountAmount = parseFloat(discount ?? 0);
          const shippingAmount = parseFloat(shipping ?? 0);

          Object.assign(updatePayload, {
            total_amount: totalAmount - discountAmount - shippingAmount,
            discount: discountAmount,
            shipping: shippingAmount,
            grand_total: totalAmount,
            item_count: orderItems.length,
            total_items: orderItems.length,
          });

          console.log(
            `✅ Backfilled ${orderItems.length} item(s) for previously-empty order ${order_id}`
          );
        } else {
          console.warn(
            `⚠️ Order ${order_id} still has no matching products — items remain unresolved`
          );
        }
      }

      await orderService.transitionOrder({
        orderId: existingOrder._id,
        orderStatus: updatePayload.order_status,
        paymentStatus: updatePayload.payment_status,
        set: Object.fromEntries(Object.entries(updatePayload).filter(([key]) => !["order_status", "payment_status"].includes(key))),
      });

      // Stamp paid_at the first time this order flips to paid — the
      // `paid_at: null` filter means this is a no-op on every later status
      // update, so an order's original payment moment is never overwritten.
      if (updatePayload.payment_status === "paid") {
        await Order.updateOne(
          { _id: existingOrder._id, paid_at: null },
          { $set: { paid_at: new Date() } }
        );
      }

      return res.status(200).json({
        status: "success",
        message: "Order already exists, status updated",
        data: {
          order_id: existingOrder.id,
          order_status: updatePayload.order_status,
          items_backfilled: updatePayload.item_count ?? 0,
        },
      });
    }

    // 👤 2. Find or create user
    let user = await User.findOne({ email: customer.email });

    if (!user) {
      console.log(`👤 Creating new user for ${customer.email}`);
      user = await User.create({
        role: "customer",
        name: `${customer.first_name} ${customer.last_name}`.trim(),
        email: customer.email,
        mobile: customer.phone || null,
        password: "external_order",
        status: "active",
      });
    }
    if (!user?.zoho_customer_id) {
      let zoho_customer = {
        contact_name: user.name,
        email: user.email,
        billing_address: {
          address: `${billing_address.address_1} ${
            billing_address.address_2 || ""
          }`,
          city: billing_address.city,
          state: billing_address.state,
          zip: billing_address.postcode,
          country: billing_address.country,
        },
        shipping_address: {
          address: `${shipping_address.address_1} ${
            shipping_address.address_2 || ""
          }`,
          city: shipping_address.city,
          state: shipping_address.state,
          zip: shipping_address.postcode,
          country: shipping_address.country,
        },
        contact_persons: [
          {
            salutation: "",
            first_name: (customer.first_name || "").slice(0, 50), // safety trimming
            last_name: (customer.last_name || "").slice(0, 50),
            email: customer.email || "",
            phone: customer.phone || "",
            mobile: customer.mobile || "",
            is_primary_contact: true,
          },
        ],
      };
      console.log(`📝 Creating Zoho customer for ${zoho_customer}`);

      const createCustomerResponse = await zohoService.createCustomer(
        zoho_customer
      );

      if (createCustomerResponse?.data?.contact?.contact_id) {
        await User.findByIdAndUpdate(
          user._id,
          {
            zoho_customer_id: createCustomerResponse.data.contact.contact_id,
          },
          { new: true }
        );
      }
    }

    // 🏠 3. Billing address
    let billingAddress = null;
    if (billing_address?.address_1) {
      const { country, state, city } = await findCountryStateCity(
        billing_address
      );

      const billingFilter = {
        user: user._id,
        full_name: `${customer.first_name} ${customer.last_name}`.trim(),
        phone: customer.phone || null,
        email: customer.email,
        address_line_1: billing_address.address_1,
        city: city,
        state: state,
        country: country,
        postcode: billing_address.postcode || "",
      };

      billingAddress = await Address.findOne(billingFilter);
      if (!billingAddress) {
        billingAddress = await Address.create({
          ...billingFilter,
          address_line_2: billing_address.address_2 || "",
          land_mark: billing_address.landmark || "",
          country_name: billing_address.country || "",
          state_name: billing_address.state || "",
          city_name: billing_address.city || "",
          purpose: "billing",
          is_default: true,
          created_by: user._id,
        });
      }
    }

    // 📬 4. Shipping address
    let shippingAddress = null;
    if (shipping_address?.address_1) {
      const { country, state, city } = await findCountryStateCity(
        shipping_address
      );

      const shippingFilter = {
        user: user._id,
        full_name: `${customer.first_name} ${customer.last_name}`.trim(),
        phone: customer.phone || null,
        email: customer.email,
        address_line_1: shipping_address.address_1,
        city: city,
        state: state,
        country: country,
        postcode: shipping_address.postcode || "",
      };

      shippingAddress = await Address.findOne(shippingFilter);
      if (!shippingAddress) {
        shippingAddress = await Address.create({
          ...shippingFilter,
          address_line_2: shipping_address.address_2 || "",
          land_mark: shipping_address.landmark || "",
          country_name: shipping_address.country || "",
          state_name: shipping_address.state || "",
          city_name: shipping_address.city || "",
          purpose: "shipping",
          is_default: false,
          created_by: user._id,
        });
      }
    }

    // 🛒 5. Resolve items BEFORE creating the order — an order with zero
    // resolvable products should never be persisted in the first place
    // (that's exactly what produced the stuck empty orders the branch
    // above now has to backfill).
    const orderItems = await resolveOrderItems(null, items);
    if (!orderItems.length) {
      throw new StatusError(400, "No valid products found in the order");
    }

    const totalAmount = parseFloat(total ?? 0);
    const discountAmount = parseFloat(discount ?? 0);
    const shippingAmount = parseFloat(shipping ?? 0);
    const sub_total = totalAmount - discountAmount - shippingAmount;

    // ✅ 6. Create the order now that we know it has real items
    const orderPaymentStatus = derivePaymentStatus(status);
    const order = await Order.create({
      id: order_id,
      user: user._id,
      billing_address: billingAddress?._id ?? null,
      shipping_address: shippingAddress?._id ?? null,
      billing_address_snapshot: snapshotAddress(billingAddress),
      shipping_address_snapshot: snapshotAddress(shippingAddress),
      payment_status: orderPaymentStatus,
      order_status: normalizedStatus,
      total_amount: sub_total,
      discount: discountAmount,
      item_count: orderItems.length,
      shipping: shippingAmount,
      grand_total: totalAmount,
      payment_method,
      // Real gateway transaction id when the plugin sent one (e.g. the
      // Razorpay payment id via WooCommerce's own get_transaction_id());
      // fall back to a synthetic id so the field is never blank.
      transaction_id: transaction_id || `EXT-${order_id}`,
      payment_meta: payment_meta && Object.keys(payment_meta).length ? payment_meta : {},
      paid_at: orderPaymentStatus === "paid" ? new Date() : null,
      total_items: orderItems.length,
      is_migrated: true,
      note: "Imported from external source",
      // Without this the schema default (Date.now, and immutable thereafter)
      // silently wins and every synced order shows the webhook-processing
      // time instead of when it was actually placed in WooCommerce.
      created_at: created_at ? new Date(created_at) : new Date(),
      updated_at: updated_at ? new Date(updated_at) : null,
    });

    for (const item of orderItems) item.order_id = order._id;
    await OrderItem.insertMany(orderItems);

    console.log(`✅ Order created: ${order.id}`);
    console.log(`📦 Order items added: ${orderItems.length}`);

    return res.status(200).json({
      status: "success",
      message: "Order synced",
      data: { order_id: order.id },
    });
  } catch (error) {
    console.error("❌ Order sync failed:", error.message);
    next(error);
  }
};

/**
 * Match WooCommerce order line items to Elexify Product/ProductVariation
 * docs by SKU — the only identifier the two systems actually share. The
 * Product schema has no field for WooCommerce's numeric product_id (there's
 * no `id`/external-id column on it at all), so the original code's
 * `Product.findOne({ id: item.product_id })` could never match anything —
 * every synced order silently ended up with zero items. `sku` is unique on
 * both Product and ProductVariation, so it's the correct join key; variable
 * products are matched against ProductVariation first (its own SKU, falling
 * back to the parent's via WooCommerce's own get_sku() behavior on the
 * plugin side) so `variation_id` gets populated correctly too.
 */
async function resolveOrderItems(orderId, items) {
  const validItems = (items ?? []).filter((item) => {
    if (item?.sku) return true;
    console.warn(
      `⚠️ Order item missing SKU (WC product_id: ${item?.product_id}) — skipped`
    );
    return false;
  });

  if (!validItems.length) return [];

  const skus = [...new Set(validItems.map((item) => item.sku))];

  // Batched instead of one findOne() per item (previously up to 2N
  // sequential round trips for an N-item order) — matches this codebase's
  // existing $in + in-memory-map convention (see
  // controllers/admin/inventory/product/add.js's Media.find({ $in })).
  const [variations, products] = await Promise.all([
    ProductVariation.find({ sku: { $in: skus } }).populate("product_id"),
    Product.find({ sku: { $in: skus } }),
  ]);

  const variationBySku = new Map(variations.map((v) => [v.sku, v]));
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const orderItems = [];

  for (const item of validItems) {
    const variationDoc = variationBySku.get(item.sku);
    const productDoc = variationDoc?.product_id
      ? variationDoc.product_id
      : productBySku.get(item.sku);

    if (!productDoc) {
      console.warn(
        `⚠️ No product/variation found for SKU: ${item.sku} (WC product_id: ${item.product_id})`
      );
      continue;
    }

    const quantity = item.quantity;
    const unit_price = parseFloat(item.unit_price ?? item.price ?? 0);
    const total_price = parseFloat(item.subtotal ?? unit_price * quantity);
    const regular_price = parseFloat(item.regular_price ?? 0);
    const sale_price = parseFloat(item.sale_price ?? 0);

    console.log(
      `🛒 Matched product: ${productDoc.name} x${quantity} (sku: ${item.sku})`
    );

    orderItems.push({
      order_id: orderId,
      product_id: productDoc._id,
      variation_id: variationDoc?._id ?? null,
      quantity,
      unit_price,
      total_price,
      regular_price,
      sale_price,
      currency: "INR",
      exchnage_rate: 1,
      product_name: productDoc.name || null,
      sku: variationDoc?.sku || productDoc.sku || null,
      variation_name: variationDoc?.combination_key || null,
    });
  }

  return orderItems;
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalize = (v) => v?.toString().trim().toLowerCase();

const findCountryStateCity = async (address) => {
  if (!address) return { country: null, state: null, city: null };

  const countryInput = normalize(address.country);
  const stateInput = normalize(address.state);
  const cityInput = normalize(address.city);

  /* -------- COUNTRY -------- */
  const country = await Country.findOne({
    status: "active",
    $or: [
      { iso2: address.country?.toUpperCase() },
      { iso3: address.country?.toUpperCase() },
      { name: { $regex: `^${escapeRegex(countryInput)}$`, $options: "i" } },
      {
        "translations.en": {
          $regex: `^${escapeRegex(countryInput)}$`,
          $options: "i",
        },
      },
    ],
  }).select("id");

  if (!country) return { country: null, state: null, city: null };

  /* -------- STATE -------- */
  const state = await State.findOne({
    status: "active",
    country_id: country.id,
    $or: [
      { iso2: address.state?.toUpperCase() },
      { state_code: address.state?.toUpperCase() },
      { name: { $regex: `^${escapeRegex(stateInput)}$`, $options: "i" } },
    ],
  }).select("id");

  if (!state) {
    return { country: country.id, state: null, city: null };
  }

  /* -------- CITY -------- */
  const city = await City.findOne({
    status: "active",
    state_id: state.id,
    name: { $regex: `^${escapeRegex(cityInput)}$`, $options: "i" },
  }).select("id");

  return {
    country: country.id,
    state: state.id,
    city: city?.id || null,
  };
};
