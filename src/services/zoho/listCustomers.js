import { getTokens } from "./getTokens.js";
import { envs } from "../../config/index.js";
import axios from "axios";
import { getIntegrationConfig } from "../integrationCredentials/index.js";

export const listCustomers = async () => {
  const accessToken = await getTokens();
  const credentials = await getIntegrationConfig("zoho", { org_id: envs.zoho.ORG_ID, base_url: envs.zoho.BASE_URL });
  if (!credentials) throw new Error("Zoho integration is disabled");
  const orgId = credentials.org_id;

  const url = `${credentials.base_url || "https://www.zohoapis.in/books/v3"}/customers?organization_id=${orgId}`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  return response.data; // array of customer objects
};
