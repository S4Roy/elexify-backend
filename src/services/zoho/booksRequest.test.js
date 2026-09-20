import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { booksRequest } from './booksRequest.js';
import { getTokens } from './getTokens.js';
import { getIntegrationConfig } from '../integrationCredentials/index.js';

vi.mock('axios', () => ({ default: { request: vi.fn() } }));
vi.mock('./getTokens.js', () => ({ getTokens: vi.fn() }));
vi.mock('../../models/ZohoConnection.js', () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
vi.mock('../integrationCredentials/index.js', () => ({ getIntegrationConfig: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  getIntegrationConfig.mockResolvedValue({ org_id: '123', base_url: 'https://www.zohoapis.in/books/v3/' });
  getTokens.mockResolvedValue('test-token');
  axios.request.mockResolvedValue({ data: { code: 0, contact: { contact_id: 'contact-1' } } });
});

describe('Zoho Books requests', () => {
  it('includes the required organization parameter and timeout', async () => {
    await booksRequest('POST', 'contacts', { data: { contact_name: 'Test' } });
    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://www.zohoapis.in/books/v3/contacts', params: { organization_id: '123' },
      timeout: 20000, data: { contact_name: 'Test' },
    }));
  });
  it('refreshes once after explicit authentication rejection', async () => {
    axios.request.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Expired token' } } });
    await booksRequest('GET', 'contacts');
    expect(getTokens).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(axios.request).toHaveBeenCalledTimes(2);
  });
  it('does not blindly repeat a POST after a timeout', async () => {
    axios.request.mockRejectedValueOnce(new Error('Request timed out'));
    await expect(booksRequest('POST', 'contacts')).rejects.toThrow('Request timed out');
    expect(axios.request).toHaveBeenCalledTimes(1);
  });
  it('reports provider validation failures even on HTTP 200', async () => {
    axios.request.mockResolvedValueOnce({ data: { code: 1001, message: 'Invalid organization' } });
    await expect(booksRequest('POST', 'contacts')).rejects.toThrow('Invalid organization (code 1001)');
  });
  it('fails before calling Zoho when organization is missing', async () => {
    getIntegrationConfig.mockResolvedValue({});
    await expect(booksRequest('POST', 'contacts')).rejects.toThrow('organization ID');
    expect(axios.request).not.toHaveBeenCalled();
  });
});
