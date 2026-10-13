import sanitizeHtml from 'sanitize-html';
import { renderEmailShell } from '../email/emailLayout.js';
import { htmlToText } from '../email/htmlToText.js';
import { emailBrand } from '../../config/emailBrand.js';
export function cleanBody(body) {
  return sanitizeHtml(body, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['https', 'mailto'], allowedSchemesByTag: { img: ['https'] }, allowProtocolRelative: false,
  });
}
// Content styles are code-owned and applied after the input allowlist. Editor
// HTML cannot inject styles, scripts, handlers or URLs outside that allowlist.
export function styleCampaignBody(body) {
  const styles = {
    h1: 'margin:0 0 24px;font-size:32px;line-height:40px;letter-spacing:-0.6px;font-weight:bold;color:#172b3a;',
    h2: 'margin:0 0 22px;font-size:30px;line-height:38px;letter-spacing:-0.5px;font-weight:bold;color:#172b3a;',
    h3: 'margin:26px 0 14px;font-size:21px;line-height:28px;font-weight:bold;color:#172b3a;',
    p: 'margin:0 0 20px;font-size:16px;line-height:27px;color:#415766;',
    ul: 'margin:0 0 24px;padding-left:24px;color:#415766;', ol: 'margin:0 0 24px;padding-left:24px;color:#415766;',
    li: 'margin:0 0 10px;font-size:16px;line-height:26px;',
    a: 'color:#087f73;text-decoration:underline;',
    img: 'display:block;max-width:100%;height:auto;border:0;border-radius:10px;margin:12px 0 24px;',
    blockquote: 'margin:24px 0;padding:16px 20px;border-left:3px solid #087f73;background-color:#f0f8f5;color:#415766;',
    hr: 'border:0;border-top:1px solid #e3e9ed;margin:28px 0;',
    table: 'width:100%;border-collapse:collapse;margin:20px 0;',
    td: 'padding:12px;border:1px solid #e3e9ed;font-size:14px;line-height:22px;',
    th: 'padding:12px;border:1px solid #e3e9ed;background-color:#f1f7f5;text-align:left;font-size:14px;line-height:22px;',
  };
  const styled = cleanBody(body).replace(/<(h[123]|p|ul|ol|li|a|img|blockquote|hr|table|td|th)(\s[^>]*|)>/g,
    (tag, name, attrs) => `<${name}${attrs} style="${styles[name]}">`);
  // A standalone linked paragraph is a primary action; inline links stay links.
  return styled.replace(/<p[^>]*>\s*<a href="(https:[^"]+)"[^>]*>([^<]+)<\/a>\s*<\/p>/g,
    (_, url, label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;"><tr><td bgcolor="#087f73" style="background-color:#087f73;border-radius:8px;text-align:center;"><a href="${url}" style="display:inline-block;padding:15px 26px;border:1px solid #087f73;border-radius:8px;background-color:#087f73;font-size:15px;line-height:20px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a></td></tr></table>`);
}
export function renderCampaign(campaign, unsubscribeUrl = '', brand = emailBrand) {
  const body = styleCampaignBody(campaign.body);
  return {
    html: renderEmailShell({ subject: campaign.subject, preheaderText: campaign.preheader, brand, contentHtml: body,
      isMarketing: true, unsubscribeUrl, campaignLabel: 'THE ELEXIFY EDIT' }),
    text: `${htmlToText(cleanBody(campaign.body))}\n\n${brand.brandName}\n${brand.companyAddress}\n${brand.androidAppUrl ? `Google Play: ${brand.androidAppUrl}\n` : ''}${brand.iosAppUrl ? `App Store: ${brand.iosAppUrl}\n` : ''}${unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : 'Preview only'}`,
  };
}
export function audienceFilter(campaign, cursor = null) {
  return { status: 'subscribed', deleted_at: null,
    ...(campaign.source !== 'all' && { source: campaign.source }),
    ...(campaign.audience_cutoff && { created_at: { $lte: campaign.audience_cutoff } }),
    ...(cursor && { _id: { $gt: cursor } }),
  };
}
