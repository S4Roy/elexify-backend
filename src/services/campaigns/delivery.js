import { StatusError } from '../../config/StatusErrors.js';
import { resolveEmailBrand } from '../email/resolveEmailBrand.js';
import nodemailer from 'nodemailer';
import { envs } from '../../config/envs.js';
import { emailBrand } from '../../config/emailBrand.js';
import { getIntegrationConfig } from '../integrationCredentials/index.js';
import { renderCampaign } from './content.js';
export function unsubscribeBase() {
  const origin = process.env.CAMPAIGN_PUBLIC_BACKEND_URL || envs.BACKEND_URL;
  let url;
  try { url = new URL(origin); } catch {
    throw StatusError.badRequest('Set BACKEND_URL or CAMPAIGN_PUBLIC_BACKEND_URL to the backend URL before sending campaigns.');
  }
  const localDevelopment = ['dev', 'development', 'test'].includes(envs.env)
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && url.protocol === 'http:';
  if ((url.protocol !== 'https:' && !localDevelopment) || url.username || url.password || url.search || url.hash) {
    throw StatusError.badRequest('Live campaigns require a public HTTPS backend URL. HTTP localhost is supported only in development or test.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}${envs.basePath}/api/v1/newsletter/unsubscribe/`;
  return url.href;
}
export async function campaignPreflight({ test = false } = {}) {
  // Test emails have no live unsubscribe link and do not reach an audience.
  if (!test) {
    unsubscribeBase();
    if (!emailBrand.companyAddress.trim()) throw StatusError.badRequest('Set EMAIL_BRAND_COMPANY_ADDRESS before sending campaigns.');
  }
  const config = await getIntegrationConfig('smtp', envs.smtp);
  if (!config?.host || !config.email || !config.password) throw new Error('Configure and enable SMTP before sending campaigns.');
  return config;
}
export async function deliverCampaign(campaign, email, unsubscribeUrl, test = false) {
  const config = await campaignPreflight({ test });
  const brand = await resolveEmailBrand();
  const transport = nodemailer.createTransport({ host: config.host, port: Number(config.port) || 465,
    secure: String(config.secure) !== 'false', auth: { user: config.email, pass: config.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  try {
    const info = await transport.sendMail({
      from: { name: emailBrand.brandName, address: config.fromEmail || config.email }, to: email,
      replyTo: emailBrand.supportEmail, subject: `${test ? '[TEST] ' : ''}${campaign.subject}`,
      ...renderCampaign(campaign, unsubscribeUrl, brand),
      ...(!test && { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
      disableFileAccess: true, disableUrlAccess: true,
    });
    if (!info.accepted?.length) { const error = new Error('Recipient rejected.'); error.responseCode = 550; throw error; }
    return info;
  } finally { transport.close(); }
}
export function failureStatus(error) {
  // A timeout/disconnect may occur after SMTP acceptance. Do not auto-retry it.
  return Number(error.responseCode) >= 400 && Number(error.responseCode) <= 599 ? 'failed' : 'unknown';
}
