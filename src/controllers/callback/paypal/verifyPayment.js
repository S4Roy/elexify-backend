import { envs } from "../../../config/index.js";
import { paymentService } from "../../../services/index.js"; // <-- ensure this exports capturePayPalOrder

/**
 * PayPal return/capture handler
 * Expects query params: token (PayPal orderID) and order_id (your local order id, optional)
 */
export const verifyPayment = async (req, res, next) => {
  try {
    const status = req.params.status || null; // PayPal token/order ID
    const token = req.query.token || req.query.orderID || null; // PayPal token/order ID
    const dbOrderId = req.query.order_id || req.query.orderId || null;

    if (!token) {
      // no token — redirect to frontend error
      return res.redirect(
        `${envs.FRONTEND_URL.replace(
          /\/$/,
          ""
        )}/checkout/failure?status=missing_token`
      );
    }

    if (status === "failure") {
      return res.redirect(
        `${envs.FRONTEND_URL.replace(/\/$/, "")}/checkout/failure?status=failed`
      );
    }
    // Call your capture helper (server-side capture)
    const result = await paymentService.capturePayPalOrder(
      String(token),
      dbOrderId
    );

    if (result?.success) {
      // capture OK — redirect to frontend success
      const localOrderId =
        result.order?.id ?? result.order?._id ?? dbOrderId ?? "";
      return res.redirect(
        `${envs.FRONTEND_URL.replace(
          /\/$/,
          ""
        )}/checkout/success?order_id=${encodeURIComponent(
          String(localOrderId)
        )}&status=success`
      );
    }

    // capture failed — redirect to failure with some debug info
    const errMsg = encodeURIComponent(result?.error ?? "capture_failed");
    return res.redirect(
      `${envs.FRONTEND_URL.replace(
        /\/$/,
        ""
      )}/checkout/failure?orderId=${encodeURIComponent(
        String(dbOrderId || "")
      )}&status=capture_failed&reason=${errMsg}`
    );
  } catch (error) {
    // Log the error for server-side debugging, then redirect.
    console.error("verifyPayment error:", error?.response?.data ?? error);

    // Redirect user to failure page with a generic error code (do not expose sensitive details)
    try {
      return res.redirect(
        `${envs.FRONTEND_URL.replace(/\/$/, "")}/checkout/failure?status=error`
      );
    } catch (redirectErr) {
      // If redirect itself fails, pass to next() so Express can handle it
      return next(redirectErr);
    }
  }
};
