import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import Product from "../../../../models/Product.js";
import Country from "../../../../models/Country.js";
import State from "../../../../models/State.js";
import City from "../../../../models/City.js";
import { StatusError } from "../../../../config/index.js";
import { zohoService } from "../../../../services/index.js";

export const addOrder = async (req, res, next) => {
  try {
    const {
      order_id,
      created_at,
      status,
      total,
      currency,
      discount,
      shipping,
      customer,
      billing_address,
      shipping_address,
      payment_method,
      items,
    } = req.body;

    console.log(`🚀 Received order: ${order_id}`);

    // 🔒 1. Prevent duplicate order
    const existingOrder = await Order.findOne({ id: order_id });
    if (existingOrder) {
      console.warn(`⚠️ Duplicate order attempt: ${order_id}`);
      const updatePayload = {
        order_status: status,
        updated_at: new Date(),
        total_items: items.length,
      };
      await Order.updateOne(
        { _id: existingOrder._id },
        { $set: updatePayload }
      );
      if (billing_address?.address_1) {
        const { country, state, city } = await findCountryStateCity(
          billing_address
        );
        console.log("billing_address", country, state, city);
      }
      if (shipping_address?.address_1) {
        const { country, state, city } = await findCountryStateCity(
          shipping_address
        );
        console.log("shipping_address ", country, state, city);
      }

      return res.status(200).json({
        status: "success",
        message: "Order already exists, status updated",
        data: {
          order_id: existingOrder.id,
          order_status: updatePayload.order_status,
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
        address_line1: billing_address.address_1,
        city: city,
        state: state,
        country: country,
        pincode: billing_address.postcode || "",
      };

      billingAddress = await Address.findOne(billingFilter);
      if (!billingAddress) {
        billingAddress = await Address.create({
          ...billingFilter,
          address_line2: billing_address.address_2 || "",
          landmark: "",
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
        address_line1: shipping_address.address_1,
        city: city,
        state: state,
        country: country,
        pincode: shipping_address.postcode || "",
      };

      shippingAddress = await Address.findOne(shippingFilter);
      if (!shippingAddress) {
        shippingAddress = await Address.create({
          ...shippingFilter,
          address_line2: shipping_address.address_2 || "",
          landmark: "",
          purpose: "shipping",
          is_default: false,
          created_by: user._id,
        });
      }
    }
    const totalAmount = parseFloat(total ?? 0);
    const discountAmount = parseFloat(discount ?? 0);
    const shippingAmount = parseFloat(shipping ?? 0);

    const sub_total = totalAmount - discountAmount - shippingAmount;
    // ✅ 5. Create Order first (without products)
    const order = await Order.create({
      id: order_id,
      user: user._id,
      billing_address: billingAddress?._id ?? null,
      shipping_address: shippingAddress?._id ?? null,
      payment_status: "pending",
      order_status: status,
      total_amount: sub_total,
      discount: discountAmount,
      item_count: items?.length || 0,
      shipping: shippingAmount,
      grand_total: totalAmount,
      payment_method,
      transaction_id: `EXT-${order_id}`,
      total_items: items.length,

      note: "Imported from external source",
    });

    const orderItems = [];
    const stockTransactions = [];

    for (const item of items) {
      const productDoc = await Product.findOne({ id: String(item.product_id) });
      if (!productDoc) {
        console.warn(`⚠️ Product not found for ID: ${item.product_id}`);
        continue;
      }

      const quantity = item.quantity;
      const unit_price = parseFloat(item.unit_price ?? item.price ?? 0);
      const total_price = parseFloat(item.subtotal ?? unit_price * quantity);
      const regular_price = parseFloat(item.regular_price ?? 0);
      const sale_price = parseFloat(item.sale_price ?? 0);

      // if (productDoc.current_stock < quantity) {
      //   throw new StatusError(400, `Insufficient stock for ${productDoc.name}`);
      // }

      // Reduce stock
      // productDoc.current_stock -= quantity;
      // await productDoc.save();

      console.log(`🛒 Adding product: ${productDoc.name} x${quantity}`);

      // ✅ Prepare order item document
      orderItems.push({
        order_id: order._id,
        product_id: productDoc._id,
        quantity,
        unit_price,
        total_price,
        regular_price,
        sale_price,
        currency: "INR",
        exchnage_rate: 1,
      });

      // 📊 Prepare stock transaction
      // stockTransactions.push({
      //   product_id: productDoc._id,
      //   type: "sale",
      //   quantity,
      //   reference_type: "order",
      //   reference_id: order._id,
      //   sale_price: unit_price,
      //   created_by: user._id,
      // });
    }

    if (!orderItems.length) {
      throw new StatusError(400, "No valid products found in the order");
    }

    // ✅ Save order items
    await OrderItem.insertMany(orderItems);

    // ✅ Save stock transactions
    // await StockTransaction.insertMany(stockTransactions);

    console.log(`✅ Order created: ${order.id}`);
    console.log(`📦 Order items added: ${orderItems.length}`);
    console.log(`📊 Stock transactions logged: ${stockTransactions.length}`);

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
const findCountryStateCity = async (address) => {
  const country = await Country.findOne({
    $or: [{ iso2: address.country_code }, { name: address.country }],
  });

  if (!country) return {};

  const state = await State.findOne({
    country_id: country.id,
    $or: [{ code: address.state_code }, { name: address.state }],
  });

  if (!state) return { country };

  const city = await City.findOne({
    state_id: state.id,
    $or: [{ name: address.city }],
  });

  return { country, state, city };
};
