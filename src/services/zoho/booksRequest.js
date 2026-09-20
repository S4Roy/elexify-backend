import axios from 'axios';
import { envs } from '../../config/index.js';
import { getIntegrationConfig } from '../integrationCredentials/index.js';
import { getTokens } from './getTokens.js';
import ZohoConnection from '../../models/ZohoConnection.js';
import { booksClient } from './ZohoBooksClient.js';

export const zohoErrorMessage = error => {
  const data = error?.response?.data || error;
  const message = typeof data === 'string' ? data : data?.message || 'Zoho Books request failed';
  const code = data?.code != null ? ` (code ${data.code})` : '';
  return `${String(message).replace(/[\r\n]+/g, ' ').slice(0, 400)}${code}`;
};

export const booksRequest = async (method, path, { data, params = {} } = {}) => {
  const connection = await ZohoConnection.findOne({ key: 'books' });
  if (connection) {
    if (!connection.connected) throw new Error('Zoho integration is disconnected');
    return booksClient(connection, method, path, { data, params });
  }
  const credentials = await getIntegrationConfig('zoho', { org_id: envs.zoho.ORG_ID, base_url: envs.zoho.BASE_URL });
  if (!credentials) throw new Error('Zoho integration is disabled');
  if (!/^\d+$/.test(String(credentials.org_id || ''))) throw new Error('Configure a valid Zoho Books organization ID');
  const url = `${(credentials.base_url || 'https://www.zohoapis.in/books/v3').replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const accessToken = await getTokens({ forceRefresh: attempt === 1 });
    try {
      const response = await axios.request({ method, url, data,
        params: { ...params, organization_id: credentials.org_id }, timeout: 20000,
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (Number(response.data?.code ?? 0) !== 0) throw new Error(zohoErrorMessage(response.data));
      return response.data;
    } catch (error) {
      // Only retry explicit authentication rejection. A timed-out POST may
      // already have created a record and must be reconciled by its caller.
      if (attempt === 0 && error.response?.status === 401) continue;
      throw new Error(zohoErrorMessage(error));
    }
  }
};
