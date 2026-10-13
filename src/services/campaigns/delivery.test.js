import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn(), getConfig: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));
vi.mock('../integrationCredentials/index.js', () => ({ getIntegrationConfig: mocks.getConfig }));
vi.mock('../../config/envs.js', () => ({ envs: { BACKEND_URL: 'https://api.example.com', basePath: '/shop', env: 'test', smtp: {} } }));
vi.mock('../../config/emailBrand.js', () => ({ emailBrand: { brandName: 'Test Store', companyAddress: '123 Store Road', supportEmail: 'support@example.com' } }));
import { envs } from '../../config/envs.js';
import { emailBrand } from '../../config/emailBrand.js';
import { deliverCampaign, campaignPreflight, unsubscribeBase } from './delivery.js';
describe('campaign SMTP envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envs.BACKEND_URL = 'https://api.example.com'; envs.env = 'test';
    emailBrand.companyAddress = '123 Store Road';
    delete process.env.CAMPAIGN_PUBLIC_BACKEND_URL; mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
    mocks.getConfig.mockResolvedValue({ host: 'smtp.example.com', email: 'store@example.com', password: 'test-only' });
    mocks.sendMail.mockResolvedValue({ accepted: ['buyer@example.com'], messageId: 'id' });
  });
  const campaign = { subject: 'Summer collection', preheader: 'Shop new arrivals', body: '<p>Welcome</p>' };
  it('sends one-click unsubscribe headers, visible footer and plain text with no file/url fetches', async () => {
    const url = unsubscribeBase() + 'a'.repeat(64);
    await deliverCampaign(campaign, 'buyer@example.com', url);
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'buyer@example.com', headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, disableFileAccess: true, disableUrlAccess: true }));
    expect(mocks.sendMail.mock.calls[0][0].text).toContain(url);
    expect(mocks.close).toHaveBeenCalled();
  });
  it('marks test mail and does not attach live unsubscribe headers', async () => {
    await deliverCampaign(campaign, 'tester@example.com', '', true);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('[TEST] Summer collection'); expect(mail.headers).toBeUndefined();
  });
  it('allows localhost HTTP for development campaigns but rejects it in production', () => {
    envs.BACKEND_URL = 'http://localhost:8000';
    expect(unsubscribeBase()).toBe('http://localhost:8000/shop/api/v1/newsletter/unsubscribe/');
    envs.env = 'production';
    expect(unsubscribeBase).toThrow('public HTTPS');
  });
  it('rejects insecure public URLs even in development', () => {
    envs.BACKEND_URL = 'http://api.example.com';
    expect(unsubscribeBase).toThrow('public HTTPS');
  });
  it('allows test emails without a public URL or mailing address', async () => {
    envs.BACKEND_URL = ''; emailBrand.companyAddress = '';
    await deliverCampaign(campaign, 'tester@example.com', '', true);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0].headers).toBeUndefined();
    await expect(campaignPreflight()).rejects.toThrow('backend URL');
  });
  it('supports an explicit public URL for production behind an internal backend', () => {
    envs.BACKEND_URL = 'http://localhost:8000'; envs.env = 'production';
    process.env.CAMPAIGN_PUBLIC_BACKEND_URL = 'https://api.example.com';
    expect(unsubscribeBase()).toBe('https://api.example.com/shop/api/v1/newsletter/unsubscribe/');
  });
  it('refuses to send when SMTP is disabled', async () => {
    mocks.getConfig.mockResolvedValue(null);
    await expect(campaignPreflight()).rejects.toThrow('Configure and enable SMTP');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it('closes the transport on an SMTP error', async () => {
    mocks.sendMail.mockRejectedValue(new Error('timeout'));
    await expect(deliverCampaign(campaign, 'buyer@example.com', 'https://example.com/out')).rejects.toThrow('timeout');
    expect(mocks.close).toHaveBeenCalled();
  });
});
