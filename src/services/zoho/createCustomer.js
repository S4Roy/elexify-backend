import { zohoService } from "../index.js";
import { envs } from "../../config/index.js";
import axios from "axios";

export const createCustomer = async (customerData) => {
  try {
    const accessToken = await zohoService.getTokens(); // match actual function name
    const url = `https://www.zohoapis.in/books/v3/contacts`;

    const response = await axios.post(url, customerData, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-invoice-organizationid": `${envs.zoho.ORG_ID}`,
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
