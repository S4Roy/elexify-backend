import axios from "axios";
import { shiprocket } from "../index.js";
const ADHOC_URL = "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc";

export const createOrder = async (order = {}) => {
  if (!order || typeof order !== "object")
    return { success: false, error: "Order payload is required" };

  const callApi = async (token) => {
    const resp = await axios.post(ADHOC_URL, order, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });
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
