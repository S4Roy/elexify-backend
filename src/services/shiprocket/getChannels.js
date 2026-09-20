import axios from "axios";
import { shiprocket } from "../index.js";

const CHANNELS_URL = "https://apiv2.shiprocket.in/v1/external/channels";

/**
 * Lists the sales channels registered on the connected Shiprocket account,
 * so the admin can pick a valid `channel_id` from a dropdown instead of
 * typing one that doesn't exist (a mismatch here makes live order search
 * return nothing, with no indication why).
 */
export const getChannels = async () => {
  const callApi = async (token) => {
    const resp = await axios.get(CHANNELS_URL, {
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

  const channels = rawResp?.data || [];
  return channels.map((channel) => ({
    id: String(channel.id),
    name: channel.channel || channel.name || `Channel ${channel.id}`,
  }));
};
