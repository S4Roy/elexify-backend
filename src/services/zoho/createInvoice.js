import { envs } from "../../config/index.js";
import axios from "axios";
import moment from "moment-timezone";
import { zohoService } from "../../services/index.js";

export const createInvoice = async (invoiceData) => {
  try {
    // 1. Get valid Zoho access token
    const accessToken = await zohoService.getTokens(); // match actual function name

    // 2. API endpoint with organization_id
    const createInvoiceUrl = `https://www.zohoapis.in/books/v3/invoices`;

    // 3. Ensure date in IST format (YYYY-MM-DD)
    const formattedDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

    // 4. Build payload (Zoho requires customer_id, line_items, etc.)
    const payload = {
      ...invoiceData,
      date: formattedDate,
    };
    console.log("Zoho Invoice Payload:", payload);

    // 5. Call Zoho API
    const response = await axios.post(createInvoiceUrl, payload, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-invoice-organizationid": `${envs.zoho.ORG_ID}`,
        "Content-Type": "application/json;charset=UTF-8",
      },
    });

    // 6. Handle success
    return {
      success: true,
      data: response.data.invoice || response.data, // return the invoice object directly if available
    };
  } catch (error) {
    console.error(
      "Zoho Invoice Creation Error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};
