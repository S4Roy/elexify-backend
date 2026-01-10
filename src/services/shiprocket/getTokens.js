import { envs } from "../../config/index.js";
import axios from "axios";
import moment from "moment-timezone";
import Token from "../../models/Token.js";

const SHIPROCKET_AUTH_URL =
  "https://apiv2.shiprocket.in/v1/external/auth/login";

/**
 * Get cached Shiprocket token (provider: 'shiprocket') or request a new one.
 * Requires envs.shiprocket.EMAIL and envs.shiprocket.PASSWORD
 */
export const getTokens = async () => {
  let tokenData = await Token.findOne({ provider: "shiprocket" });

  if (!tokenData) {
    tokenData = await Token.create({
      provider: "shiprocket",
      // optional: store identifying info but NOT password in plain text if you prefer
      email: envs.shiprocket?.email || null,
      access_token: null,
      expires_at: moment().subtract(1, "minute").tz("Asia/Kolkata").toDate(),
    });
  }

  // Return existing valid token
  if (
    tokenData.access_token &&
    moment().tz("Asia/Kolkata").isBefore(moment(tokenData.expires_at))
  ) {
    return tokenData.access_token;
  }

  // Need to fetch a new token
  try {
    if (!envs.shiprocket?.email || !envs.shiprocket?.password) {
      throw new Error("Missing SHIPROCKET credentials in envs.shiprocket");
    }

    const payload = {
      email: envs.shiprocket.email,
      password: envs.shiprocket.password,
    };

    const response = await axios.post(SHIPROCKET_AUTH_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    // Shiprocket often returns { token: "..." } but be defensive
    const token =
      response?.data?.token ||
      response?.data?.data?.token ||
      response?.data?.access_token ||
      null;

    if (!token) {
      console.error("Unexpected Shiprocket auth response:", response.data);
      throw new Error("No token returned from Shiprocket auth");
    }

    // expires_in may be present (seconds). Fallback to 23 hours if absent.
    const expiresIn =
      response?.data?.expires_in ||
      response?.data?.data?.expires_in ||
      23 * 3600;

    tokenData.access_token = token;
    tokenData.expires_at = moment()
      .tz("Asia/Kolkata")
      .add(Number(expiresIn), "seconds")
      .toDate();

    await tokenData.save();

    return token;
  } catch (error) {
    console.error(
      "Shiprocket token fetch failed:",
      error.response?.data || error.message
    );
    throw new Error("Failed to obtain Shiprocket token");
  }
};
