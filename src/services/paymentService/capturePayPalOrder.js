// services/paymentService/capturePayPalOrder.js
import axios from "axios";
import { envs } from "../../config/index.js";
import Order from "../../models/Order.js";
import { getPayPalToken } from "./getPayPalToken.js";
import { inventoryService } from "../index.js";

/**
 * Capture a PayPal order server-side and update local Order.
 *
 * @param {string} orderID - PayPal order id (token)
 * @param {string|null} dbOrderIdentifier - optional local order _id or local id (ORD-...) to lookup order
 * @returns {Promise<{ success: boolean, capture?: object, order?: object|null, error?: string }>}
 */
export const capturePayPalOrder = async (orderID, dbOrderIdentifier = null) => {
  try {
    if (!orderID) throw new Error("orderID is required");

    // Get cached token + base url
    const { accessToken, base } = await getPayPalToken();
    if (!accessToken) throw new Error("Failed to obtain PayPal access token");

    // Perform capture
    const captureResp = await axios({
      method: "post",
      url: `${base}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      data: {}, // empty body
      timeout: 20000,
    });

    const captureResult = captureResp?.data;

    // Defensive extraction
    const pu = (captureResult.purchase_units || [])[0] ?? null;
    const capture = pu?.payments?.captures?.[0] ?? null;
    const captureId = capture?.id ?? null;
    const status = (
      capture?.status ??
      captureResult.status ??
      "UNKNOWN"
    ).toUpperCase();

    // Build DB lookup
    let lookup = { "payment_meta.paypal_order_id": orderID }; // fallback
    if (dbOrderIdentifier) {
      const idStr = String(dbOrderIdentifier);
      if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
        lookup = {
          $or: [
            { _id: idStr },
            { id: idStr },
            { "payment_meta.paypal_order_id": orderID },
          ],
        };
      } else {
        lookup = {
          $or: [{ id: idStr }, { "payment_meta.paypal_order_id": orderID }],
        };
      }
    }

    // Prepare update patch
    const setPatch = {
      "payment_meta.paypal_capture_id": captureId,
      "payment_meta.paypal_payment_status": status,
      "payment_meta.paypal_order_id": orderID,
    };

    if (status === "COMPLETED") {
      setPatch.payment_status = "paid";
      setPatch.order_status = "processing";
    } else if (status === "PENDING") {
      setPatch.payment_status = "pending";
    } else if (status === "DECLINED" || status === "FAILED") {
      setPatch.payment_status = "failed";
    } else {
      setPatch.payment_status = setPatch.payment_status ?? "pending";
    }

    // Optional idempotency: if order already has paypal_capture_id with same value, skip update
    const existingOrder = await Order.findOne(lookup).lean();
    if (
      existingOrder &&
      existingOrder.payment_meta?.paypal_capture_id === captureId
    ) {
      return { success: true, capture: captureResult, order: existingOrder };
    }

    // Update local order (returns null if not found)
    const updatedOrder = await Order.findOneAndUpdate(
      lookup,
      { $set: setPatch },
      { new: true }
    );
    if (updatedOrder) {
      await inventoryService.cartService.clearCarts(updatedOrder.user);
    }
    return {
      success: true,
      capture: captureResult,
      order: updatedOrder ?? null,
    };
  } catch (err) {
    // If PayPal returned structured error, include debug info
    if (err?.response?.data) {
      const pd = err.response.data;
      console.error("❌ capturePayPalOrder PayPal error:", {
        message: pd?.message,
        debug_id: pd?.debug_id,
        details: pd?.details,
      });
      return {
        success: false,
        error: `PayPal error: ${pd?.message || JSON.stringify(pd)}${
          pd?.debug_id ? ` (debug_id: ${pd.debug_id})` : ""
        }`,
      };
    }

    console.error("❌ capturePayPalOrder unexpected error:", err);
    return { success: false, error: err.message || String(err) };
  }
};
