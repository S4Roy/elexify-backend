import axios from "axios";
import { shiprocket } from "../index.js";
const ASSIGN_AWB_URL = "https://apiv2.shiprocket.in/v1/external/courier/assign/awb";

// Mirrors createOrder.js's token/retry pattern. The adhoc order-create
// response never carries a courier/AWB on its own — Shiprocket only
// assigns one when this endpoint is called explicitly, exactly like the
// reverse-shipment flow already does in returnService/pickup.js.
export const assignAwb = async (shipmentId) => {
  if (!shipmentId) return { success: false, error: "shipmentId is required" };

  const callApi = async (token) => {
    const resp = await axios.post(
      ASSIGN_AWB_URL,
      { shipment_id: Number(shipmentId) },
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
