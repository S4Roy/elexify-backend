// services/paymentService/getPayPalToken.js
import { envs } from "../../config/index.js";
import axios from "axios";
import moment from "moment-timezone";
import Token from "../../models/Token.js"; // same model you used for Shiprocket tokens

/**
 * Get cached PayPal access token (provider: 'paypal') or request a new one.
 * Returns: { accessToken, base }
 */
export const getPayPalToken = async () => {
  // Ensure Token doc exists for provider 'paypal'
  let tokenDoc = await Token.findOne({ provider: "paypal" });
  if (!tokenDoc) {
    tokenDoc = await Token.create({
      provider: "paypal",
      access_token: null,
      expires_at: moment().subtract(1, "minute").tz("Asia/Kolkata").toDate(),
    });
  }

  // If token exists and is not expired, return it
  if (
    tokenDoc.access_token &&
    moment().tz("Asia/Kolkata").isBefore(moment(tokenDoc.expires_at))
  ) {
    return {
      accessToken: tokenDoc.access_token,
      base:
        (envs.paypal?.env || "sandbox").toLowerCase() === "live"
          ? "https://api-m.paypal.com"
          : "https://api-m.sandbox.paypal.com",
    };
  }

  // Otherwise request a new token
  try {
    const clientId = envs.paypal?.client_id;
    const clientSecret = envs.paypal?.secret;
    if (!clientId || !clientSecret) {
      throw new Error("Missing PayPal credentials in envs.paypal");
    }

    const envName = (envs.paypal?.env || "sandbox").toLowerCase();
    const base =
      envName === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    const tokenResp = await axios({
      method: "post",
      url: `${base}/v1/oauth2/token`,
      auth: { username: clientId, password: clientSecret },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      params: { grant_type: "client_credentials" },
      timeout: 10000,
    });

    const accessToken =
      tokenResp?.data?.access_token || tokenResp?.data?.accessToken || null;

    if (!accessToken) {
      console.error("Unexpected PayPal token response:", tokenResp?.data);
      throw new Error("No access token returned from PayPal");
    }

    // expires_in is seconds. Fallback to 8 minutes if absent (PayPal default is 9 hours? but safe fallback).
    const expiresIn = Number(tokenResp?.data?.expires_in) || 60 * 60 * 8; // default 8 hours
    tokenDoc.access_token = accessToken;
    tokenDoc.expires_at = moment()
      .tz("Asia/Kolkata")
      .add(expiresIn, "seconds")
      .toDate();
    await tokenDoc.save();

    return { accessToken, base };
  } catch (err) {
    console.error(
      "Failed to obtain PayPal token:",
      err.response?.data ?? err.message ?? err
    );
    throw new Error("Failed to obtain PayPal token");
  }
};
