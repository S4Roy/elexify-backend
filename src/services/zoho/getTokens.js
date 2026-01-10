import { envs } from "../../config/index.js";
import axios from "axios";
import qs from "qs";
import moment from "moment-timezone";
import Token from "../../models/Token.js";

const ZOHO_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";

export const getTokens = async () => {
  let tokenData = await Token.findOne({ provider: "zoho" });

  if (!tokenData) {
    tokenData = await Token.create({
      provider: "zoho",
      client_id: envs.zoho.CLIENT_ID,
      client_secret: envs.zoho.CLIENT_SECRET,
      refresh_token: envs.zoho.REFRESH_TOKEN,
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

  // Refresh token expired or no access_token
  try {
    const data = {
      refresh_token: tokenData.refresh_token,
      client_id: envs.zoho.CLIENT_ID,
      client_secret: envs.zoho.CLIENT_SECRET,
      grant_type: "refresh_token",
    };

    const response = await axios.post(ZOHO_TOKEN_URL, qs.stringify(data), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { access_token, expires_in } = response.data;

    tokenData.access_token = access_token;
    tokenData.expires_at = moment()
      .tz("Asia/Kolkata")
      .add(expires_in, "seconds")
      .toDate();

    await tokenData.save();

    return access_token;
  } catch (error) {
    console.error(
      "Zoho token refresh failed:",
      error.response?.data || error.message
    );
    throw new Error("Failed to refresh Zoho access token");
  }
};
