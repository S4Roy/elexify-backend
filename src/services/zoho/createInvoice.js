import { envs } from "../../config/index.js";
import axios from "axios";
import moment from "moment-timezone";
import { getTokens } from "./getTokens.js";
import { getIntegrationConfig } from "../integrationCredentials/index.js";

export const createInvoice = async (invoiceData) => {
  try {
    // 1. Get valid Zoho access token
    const accessToken = await getTokens();
    const credentials = await getIntegrationConfig("zoho", { org_id: envs.zoho.ORG_ID, base_url: envs.zoho.BASE_URL });
    if (!credentials) throw new Error("Zoho integration is disabled");

    // 2. API endpoint with organization_id
    const createInvoiceUrl = new URL(`${credentials.base_url || "https://www.zohoapis.in/books/v3"}/invoices`);
    createInvoiceUrl.searchParams.set("organization_id", credentials.org_id);
    if (invoiceData.invoice_number) {
      createInvoiceUrl.searchParams.set("ignore_auto_number_generation", "true");
    }

    // 3. Ensure date in IST format (YYYY-MM-DD)
    const formattedDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

    // 4. Build payload (Zoho requires customer_id, line_items, etc.)
    const payload = {
      ...invoiceData,
      date: formattedDate,
    };
    console.log("Zoho Invoice Payload:", payload);

    // 5. Call Zoho API
    const response = await axios.post(createInvoiceUrl.toString(), payload, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "X-com-zoho-invoice-organizationid": `${credentials.org_id}`,
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
