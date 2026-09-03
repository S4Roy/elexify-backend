import { getTokens } from "./getTokens.js";
import { envs } from "../../config/index.js";
import axios from "axios";
import { getIntegrationConfig } from "../integrationCredentials/index.js";

export const createCustomer = async (customerData) => {
  try {
    const accessToken = await getTokens();
    const credentials = await getIntegrationConfig("zoho", { org_id: envs.zoho.ORG_ID, base_url: envs.zoho.BASE_URL });
    if (!credentials) throw new Error("Zoho integration is disabled");
    const url = `${credentials.base_url || "https://www.zohoapis.in/books/v3"}/contacts`;

    const response = await axios.post(url, customerData, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-invoice-organizationid": `${credentials.org_id}`,
        "Content-Type": "application/json",
      },
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error(
      "Zoho Create Customer Error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};
