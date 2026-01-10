import { zohoService } from "../../services/index.js";
import { envs } from "../../config/index.js";
import axios from "axios";

export const listCustomers = async () => {
  const accessToken = await zohoService.getTokens(); // match actual function name
  const orgId = envs.zoho.ORG_ID;

  const url = `https://www.zohoapis.in/books/v3/customers?organization_id=${orgId}`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  return response.data; // array of customer objects
};
