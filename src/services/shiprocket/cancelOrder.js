import axios from "axios";
import { shiprocket } from "../index.js";
const CANCEL_URL = "https://apiv2.shiprocket.in/v1/external/orders/cancel";

// Mirrors createOrder.js exactly (same token/retry-on-401 pattern). Used to
// cancel a package's Shiprocket shipment before it's been picked up by the
// courier — see src/services/orderService/packages/cancelPackage.js.
export const cancelOrder = async (shiprocketOrderIds = []) => {
  const ids = (Array.isArray(shiprocketOrderIds) ? shiprocketOrderIds : [shiprocketOrderIds]).filter(Boolean);
  if (!ids.length) return { success: false, error: "shiprocketOrderIds is required" };

  const callApi = async (token) => {
    const resp = await axios.post(
      CANCEL_URL,
      { ids },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 20000 },
    );
    return resp.data;
  };

  try {
    let token = await shiprocket.getTokens();
    let rawResp;
    try {
      rawResp = await callApi(token);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        await shiprocket.invalidateToken().catch(() => {});
        token = await shiprocket.getTokens();
        rawResp = await callApi(token);
      } else {
        return { success: false, error: err.response?.data || err.message };
      }
    }
    return { success: true, data: rawResp };
  } catch (err) {
    return { success: false, error: err?.response?.data || err.message || err };
  }
};
