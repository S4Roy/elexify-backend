// services/paymentService/checkPaypalStatus.js
import axios from "axios";
import { envs } from "../../config/index.js";
import Order from "../../models/Order.js";
import { getPayPalToken } from "./getPayPalToken.js";

/**
 * Check PayPal order status (GET) and update only the local Order record.
 *
 * @param {string} orderID - PayPal order id (token)
 * @param {string|null} dbOrderIdentifier - optional local order _id or local id (ORD-...) to lookup order
 * @returns {Promise<{ success: boolean, order?: object|null, paypalOrder?: object, error?: string }>}
 */
export const checkPaypalStatus = async (orderID, dbOrderIdentifier = null) => {
  try {
    if (!orderID) throw new Error("orderID is required");

    // Get cached token + base url
    const { accessToken, base } = await getPayPalToken();
    if (!accessToken) throw new Error("Failed to obtain PayPal access token");

    // 1) Fetch PayPal order (GET)
    const resp = await axios({
      method: "get",
      url: `${base}/v2/checkout/orders/${encodeURIComponent(orderID)}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 15000,
    });

    const paypalOrder = resp?.data ?? null;

    // Defensive extraction
    // Top-level status is e.g. "COMPLETED", "APPROVED", "PAYER_ACTION_REQUIRED", "CREATED", etc.
    const topStatus = (paypalOrder?.status ?? "UNKNOWN")
      .toString()
      .toUpperCase();

    // Inspect purchase unit captures if present (captures array may be nested)
    const pu = (paypalOrder?.purchase_units || [])[0] ?? null;
    const captures = pu?.payments?.captures ?? [];

    // Prefer capture status if available (use last capture)
    const lastCapture = captures.length ? captures[captures.length - 1] : null;
    const captureStatus = lastCapture?.status
      ? lastCapture.status.toUpperCase()
      : null;
    const captureId = lastCapture?.id ?? null;

    // Determine canonical payment status
    // Priority: captureStatus -> topStatus
    let canonicalStatus = "PENDING";
    if (captureStatus === "COMPLETED" || topStatus === "COMPLETED") {
      canonicalStatus = "COMPLETED";
    } else if (
      captureStatus === "PENDING" ||
      topStatus === "APPROVED" ||
      topStatus === "PENDING"
    ) {
      canonicalStatus = "PENDING";
    } else if (
      captureStatus === "DECLINED" ||
      captureStatus === "FAILED" ||
      topStatus === "VOIDED" ||
      topStatus === "CANCELLED"
    ) {
      canonicalStatus = "FAILED";
    } else {
      // fallback keep as topStatus mapped to generic labels
      if (
        topStatus === "CREATED" ||
        topStatus === "SAVED" ||
        topStatus === "APPROVED"
      )
        canonicalStatus = "PENDING";
      else canonicalStatus = "PENDING";
    }

    // Build DB lookup (idempotent & flexible)
    let lookup = {
      "payment_meta.paypal_order_id": orderID,
      "payment_meta.paypal_capture_id": null,
    }; // fallback

    // Prepare patch fields
    const setPatch = {
      "payment_meta.paypal_order_id": orderID,
      "payment_meta.paypal_capture_id": captureId ?? null,
      "payment_meta.paypal_payment_status": canonicalStatus,
    };
    setPatch.order_status = "failed";
    if (canonicalStatus === "COMPLETED") {
      setPatch.payment_status = "paid";
      setPatch.order_status = "processing";
      setPatch.paid_at = new Date();
    } else if (canonicalStatus === "PENDING") {
      setPatch.payment_status = "pending";
      setPatch.order_status = "failed";
    } else if (canonicalStatus === "FAILED") {
      setPatch.payment_status = "failed";
      setPatch.order_status = "cancelled";
    }

    // Update local Order document
    const updatedOrder = await Order.findOneAndUpdate(
      lookup,
      { $set: setPatch },
      { new: true }
    );
    console.log(updatedOrder?.id ?? null);

    return {
      success: true,
      order: updatedOrder?.id ?? null,
      payment_status: setPatch?.payment_status,
      order_status: setPatch?.order_status,
    };
  } catch (err) {
    if (err?.response?.data) {
      const pd = err.response.data;
      console.error("❌ checkPaypalStatus PayPal error:", {
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

    console.error("❌ checkPaypalStatus unexpected error:", err);
    return { success: false, error: err?.message || String(err) };
  }
};
