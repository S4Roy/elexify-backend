import axios from 'axios';
import { getTokens } from './getTokens.js';
import { invalidateToken } from './invalidateToken.js';

export const returnApi = async (method, path, data) => {
  const call = async () => axios({ method, url: `https://apiv2.shiprocket.in/v1/external/${path}`,
    headers: { Authorization: `Bearer ${await getTokens()}` },
    ...(method === 'GET' ? { params: data } : { data }), timeout: 20000 });
  try { return (await call()).data; }
  catch (error) {
    if ([401, 403].includes(error.response?.status)) {
      await invalidateToken();
      return (await call()).data;
    }
    throw error;
  }
};
