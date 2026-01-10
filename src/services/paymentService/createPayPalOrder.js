// services/paymentService/createPayPalOrder.js
import axios from "axios";
import { envs } from "../../config/index.js";
import { getPayPalToken } from "./getPayPalToken.js";
const { accessToken, base } = await getPayPalToken();

/**
 * Strict create PayPal order helper with validation and verbose error logging.
 */
export const createPayPalOrder = async (
  totalAmount,
  currency = "USD",
  order_id,
  items = []
) => {
  try {
    // normalize and validate currency
    currency = String(currency || "USD").toUpperCase();

    // validate totalAmount and format as string with 2 decimals
    const total = Number(totalAmount);
    if (Number.isNaN(total) || total < 0) {
      throw new Error("Invalid totalAmount");
    }
    const valueStr = total.toFixed(2);
    if (!/^\d+\.\d{2}$/.test(valueStr)) {
      throw new Error("totalAmount must format to a string with 2 decimals");
    }

    // sanitize and validate items, compute items total
    let sanitizedItems = [];
    let itemsTotal = 0;
    if (Array.isArray(items) && items.length) {
      sanitizedItems = items.map((it, idx) => {
        const name = String(it.name ?? it.product ?? `Item ${idx + 1}`)
          .trim()
          .substring(0, 127);
        const qty = Number(it.qty ?? 1);
        const price = Number(it.price ?? 0);

        if (Number.isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for item ${name}`);
        }
        if (Number.isNaN(price) || price < 0) {
          throw new Error(`Invalid price for item ${name}`);
        }

        const unitValue = price.toFixed(2);
        const lineTotal = Number((price * qty).toFixed(2));
        itemsTotal += lineTotal;

        return {
          name,
          unit_amount: { currency_code: currency, value: unitValue },
          quantity: String(qty),
        };
      });

      // round itemsTotal to 2 decimals
      itemsTotal = Number(itemsTotal.toFixed(2));
    }

    // If items provided, ensure itemsTotal matches total (or else drop items to avoid schema mismatch)
    if (sanitizedItems.length > 0) {
      const itemsTotalStr = itemsTotal.toFixed(2);
      if (itemsTotalStr !== valueStr) {
        console.warn(
          `PayPal: items total (${itemsTotalStr}) does not match order total (${valueStr}). ` +
            "PayPal requires consistency. Omitting individual items and sending only amount to avoid INVALID_PARAMETER_SYNTAX."
        );
        // decide: omit items and send only amount, to avoid mismatch errors
        sanitizedItems = [];
      }
    }

    // Build purchase unit
    const purchaseUnit = {
      amount: {
        currency_code: currency,
        value: valueStr,
        // include breakdown only if items were included and match
        ...(sanitizedItems.length > 0
          ? {
              breakdown: {
                item_total: { currency_code: currency, value: valueStr },
              },
            }
          : {}),
      },
      ...(sanitizedItems.length > 0 ? { items: sanitizedItems } : {}),
    };
    // Build Orders.create body with return/cancel url to frontend
    const returnUrl = `${
      envs.BACKEND_URL
    }/callback/paypal/return?order_id=${encodeURIComponent(String(order_id))}`;
    const cancelUrl = `${
      envs.BACKEND_URL
    }/callback/paypal/failure?order_id=${encodeURIComponent(String(order_id))}`;

    const body = {
      intent: "CAPTURE",
      purchase_units: [purchaseUnit],
      application_context: {
        brand_name: envs?.PROJECT_NAME || "Your Shop",
        shipping_preference: "NO_SHIPPING",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    };

    // debug log: exact payload being sent
    console.info("PayPal create order payload:", JSON.stringify(body, null, 2));

    if (!accessToken) throw new Error("Failed to obtain PayPal access token");

    // Create order
    const createResp = await axios({
      method: "post",
      url: `${base}/v2/checkout/orders`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      data: body,
    });

    const orderResult = createResp?.data;
    const approveLink = (orderResult.links || []).find(
      (l) => l.rel === "approve"
    )?.href;

    const paypalOrderId = orderResult?.id;
    if (!paypalOrderId) throw new Error("PayPal did not return an order id");

    // Optionally persist paypalOrderId on your local order:
    // if (receipt) await Order.findOneAndUpdate({ id: receipt }, { $set: { "payment_meta.paypal_order_id": paypalOrderId } });

    return { paypalOrderId, raw: orderResult, approveLink };
  } catch (err) {
    // Axios/PayPal detailed error handling
    if (err?.response?.data) {
      const pd = err.response.data;
      console.error("❌ PayPal create order failed — response:", {
        name: pd.name,
        message: pd.message,
        debug_id: pd.debug_id || "",
        details: pd.details,
      });

      const detailMessages = (pd.details || []).map(
        (d) => d.issue || d.description || JSON.stringify(d)
      );
      const joined = detailMessages.join("; ");

      // Provide friendly guidance for common syntax/validation problems
      if (
        joined.toLowerCase().includes("invalid") ||
        joined.toLowerCase().includes("syntax")
      ) {
        throw new Error(
          `PayPal validation error: ${pd.message}. details: ${joined} ` +
            "Check request payload, currency codes, and that item totals exactly match order total."
        );
      }

      throw new Error(
        `PayPal error: ${pd.message}. details: ${joined}
        }`
      );
    }

    console.error("❌ PayPal Order Creation Error:", err);
    throw err;
  }
};
