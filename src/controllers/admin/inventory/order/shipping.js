import Order from "../../../../models/Order.js";
import { StatusError, envs } from "../../../../config/index.js";
import { shiprocket, inventoryService } from "../../../../services/index.js";
import moment from "moment-timezone";

export const shipping = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const {
      weight: qWeight,
      length: qLength,
      width: qWidth,
      height: qHeight,
      _id = null,
    } = req.body;

    if (!_id) throw new StatusError(400, "_id (order id) is required in query");

    const order_data = await inventoryService.orderService.details(_id);
    if (!order_data) throw new StatusError(404, "Order not found");

    // --- parse numeric inputs, fallback to null if not provided
    const lengthNum = qLength ? Number(qLength) : null;
    const widthNum = qWidth ? Number(qWidth) : null;
    const heightNum = qHeight ? Number(qHeight) : null;
    const weightNum = qWeight ? Number(qWeight) : null;

    // --- compute volumetric weight if product dimensions exist or dimensions provided
    const volumetricFromQuery =
      lengthNum && widthNum && heightNum
        ? (lengthNum * widthNum * heightNum) / 5000.0
        : 0;

    // If no query dims, try to compute from order items product dimensions (best-effort)
    let totalVolWeightFromProducts = 0;
    if (!volumetricFromQuery && Array.isArray(order_data.order_items)) {
      for (const it of order_data.order_items) {
        const prod = it.product || it.product_doc || {};
        const dims = prod.dimensions || {};
        const l = Number(dims.length || dims.l || 0) || 0;
        const w = Number(dims.width || dims.w || 0) || 0;
        const h = Number(dims.height || dims.h || 0) || 0;
        if (l && w && h) {
          totalVolWeightFromProducts +=
            ((l * w * h) / 5000.0) * (it.quantity || it.units || 1);
        }
      }
    }

    // decide final weight: prefer provided weight -> volumetric from query -> volumetric from products -> fallback env/default
    const DEFAULT_WEIGHT = Number(process.env.DEFAULT_WEIGHT_KG || 0.5);
    const finalWeight =
      weightNum ||
      volumetricFromQuery ||
      totalVolWeightFromProducts ||
      DEFAULT_WEIGHT;

    // decide dimensions: prefer provided or sensible default
    const DEFAULT_DIM = Number(process.env.DEFAULT_DIM_CM || 10);
    const finalLength = lengthNum || DEFAULT_DIM;
    const finalWidth = widthNum || DEFAULT_DIM;
    const finalHeight = heightNum || DEFAULT_DIM;

    // --- Basic billing validation (Shiprocket requires these)
    const billing = order_data.billing_address || {};
    // const requiredBilling = [
    //   "full_name",
    //   "address_line_1",
    //   "city",
    //   "postcode",
    //   "state",
    //   "country",
    //   "phone",
    // ];
    // const missingBilling = requiredBilling.filter(
    //   (k) => !billing[k] || String(billing[k]).trim() === ""
    // );
    // if (missingBilling.length) {
    //   throw new StatusError(
    //     400,
    //     "Please add billing address fields: " + missingBilling.join(", ")
    //   );
    // }

    // If shipping absent, copy billing if shipping_is_billing true OR shipping fields empty
    const shipping = order_data.shipping_address || {};
    const shippingEmpty =
      !shipping ||
      !shipping.address_line_1 ||
      !shipping.city.name ||
      !shipping.postcode;
    const shipping_is_billing = !!order_data.shipping_is_billing;

    // Build payload
    const payload = {
      order_id: order_data.id || order_data._id || `ORD-${Date.now()}`,
      order_date: moment(order_data.created_at || new Date())
        .tz("Asia/Kolkata")
        .format("YYYY-MM-DD HH:mm"),
      pickup_location: envs.PROJECT_NAME,
      channel_id: (envs.shiprocket && envs.shiprocket.channel_id) || "7990522",
      comment: order_data.note || order_data.comment || "",
      billing_customer_name: billing.full_name,
      billing_last_name: billing.last_name || "",
      billing_address: billing.address_line_1,
      billing_address_2: billing.address_line_2 || "",
      billing_city: billing.city.name,
      billing_pincode: String(billing.postcode),
      billing_state: billing.state.name,
      billing_country: billing.country.name || "India",
      billing_email: billing.email || order_data.user?.email || "",
      billing_phone: String(billing.phone),
      // If shipping_is_billing true OR shipping data empty, set shipping_is_billing true and leave shipping fields blank (Shiprocket accepts)
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
      order_items: (order_data.order_items || []).map((item) => ({
        name: item.display_name || item.name,
        sku:
          item.sku ||
          (item.product && item.product.sku) ||
          `SKU-${item.product_id || item._id}`,
        units: Number(item.quantity || item.units || 1),
        selling_price: Number(
          item.unit_price || item.selling_price || item.price || 0
        ),
        discount: item.discount || "",
        tax: item.tax || "",
        hsn: item.hsn || "",
      })),
      payment_method: String(order_data.payment_method || "Prepaid")
        .toLowerCase()
        .includes("cod")
        ? "COD"
        : "Prepaid",
      shipping_charges: Number(
        order_data.shipping_charges || order_data.shipping || 0
      ),
      giftwrap_charges: Number(order_data.giftwrap_charges || 0),
      transaction_charges: Number(order_data.transaction_charges || 0),
      total_discount: Number(order_data.discount || 0),
      sub_total: Number(
        order_data.grand_total ||
          order_data.sub_total ||
          order_data.subtotal ||
          0
      ),
      length: String(Math.round(finalLength)),
      breadth: String(Math.round(finalWidth)),
      height: String(Math.round(finalHeight)),
      weight: String(Number(finalWeight).toFixed(2)),
    };

    // If shipping_is_billing is false but shipping fields present and valid, copy them into payload
    if (!shipping_is_billing && !shippingEmpty) {
      payload.shipping_is_billing = false;
      payload.shipping_customer_name =
        shipping.full_name || payload.billing_customer_name;
      payload.shipping_last_name = shipping.last_name || "";
      payload.shipping_address =
        shipping.address_line_1 || payload.billing_address;
      payload.shipping_address_2 = shipping.address_line_2 || "";
      payload.shipping_city = shipping.city.name || payload.billing_city;
      payload.shipping_pincode = String(
        shipping.postcode || payload.billing_pincode
      );
      payload.shipping_state = shipping.state.name || payload.billing_state;
      payload.shipping_country =
        shipping.country.name || payload.billing_country;
      payload.shipping_email = shipping.email || payload.billing_email;
      payload.shipping_phone = String(shipping.phone || payload.billing_phone);
    }

    // final sanity: ensure at least one order item
    if (!payload.order_items || payload.order_items.length === 0) {
      throw new StatusError(
        400,
        "Order must have at least one order_items entry"
      );
    }

    // --- Call Shiprocket createOrder
    const createOrderResp = await shiprocket.createOrder(payload);

    if (!createOrderResp || !createOrderResp.success) {
      // bubble up Shiprocket message (be explicit)
      const errMsg =
        createOrderResp?.error ||
        createOrderResp?.data ||
        "Shiprocket createOrder failed";
      throw new StatusError(
        502,
        typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)
      );
    }

    // Extract shiprocket order id if possible
    const respData = createOrderResp.data || {};
    const ship_order_id =
      (respData.data && respData.data.order_id) ||
      respData.order_id ||
      respData.shipment_id ||
      (respData.data && respData.data.shipment_id) ||
      null;

    // Persist mapping to Order (idempotency reference)
    try {
      const update = {
        $set: {
          shiprocket_order_id: ship_order_id,
        },
      };
      await Order.updateOne({ _id: order_data._id }, update).catch(() => {});
    } catch (err) {
      // don't fail the whole flow for persistence error — return a warning
      console.warn("Failed to persist Shiprocket mapping", err);
    }

    return res.status(200).json({
      status: "success",
      message: "Sent to ShipRocket Successfully",
      data: {
        payload,
        shiprocket: createOrderResp.data,
        ship_order_id,
      },
    });
  } catch (error) {
    // if StatusError (our custom error containing status), pass through; else 500
    return next(error);
  }
};
