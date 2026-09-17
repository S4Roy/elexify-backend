import axios from "axios";
import { shiprocket } from "../index.js";

const PICKUP_LOCATIONS_URL = "https://apiv2.shiprocket.in/v1/external/settings/company/pickup";

/**
 * Lists pickup addresses registered on the connected Shiprocket account, so
 * the admin can pick a valid `pickup_location` nickname instead of typing
 * one that doesn't match Shiprocket's records (a mismatch here fails order
 * creation with an opaque Shiprocket error).
 */
export const getPickupLocations = async () => {
  const callApi = async (token) => {
    const resp = await axios.get(PICKUP_LOCATIONS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return resp.data;
  };

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
      throw new Error(err.response?.data?.message || err.message);
    }
  }

  const addresses = rawResp?.data?.shipping_address || [];
  return addresses.map((address) => ({
    pickup_location: address.pickup_location,
    address: address.address,
    city: address.city,
    state: address.state,
    pincode: address.pin_code,
    phone: address.phone,
  }));
};
