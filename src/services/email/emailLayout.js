import Handlebars from 'handlebars';
import './emailComponents.js';

// Shared email chrome uses presentation tables and inline styles. Campaign
// typography is also inlined separately so it survives clients stripping CSS.
const SHELL_SOURCE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{{subject}}</title>
<style>@media only screen and (max-width:480px){.email-outer{padding:16px 8px!important}.email-content{padding:28px 22px!important}.email-footer{padding:16px 18px!important}.email-heading{font-size:28px!important;line-height:36px!important}.footer-column{padding:0 6px!important}.app-link{display:inline-block!important;margin:4px!important}.footer-link{display:inline-block!important;margin-bottom:2px!important}}</style>
</head><body style="margin:0;padding:0;background-color:#f2f5f7;color:#172b3a;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{{preheaderText}}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f5f7;"><tr><td align="center" class="email-outer" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e3e9ed;border-radius:16px;overflow:hidden;">
<tr><td style="height:5px;background-color:#087f73;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:30px 28px 26px;background-color:#ffffff;border-bottom:1px solid #edf1f4;">
{{#if brand.storefrontUrl}}<a href="{{brand.storefrontUrl}}" style="text-decoration:none;">{{/if}}<img src="{{brand.logoUrl}}" alt="{{brand.brandName}}" width="148" style="display:block;max-width:148px;width:100%;height:auto;border:0;">{{#if brand.storefrontUrl}}</a>{{/if}}
</td></tr>
<tr><td class="email-content" style="padding:40px 40px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#334b5c;">
{{#if campaignLabel}}<p style="margin:0 0 16px;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#087f73;">{{campaignLabel}}</p>{{/if}}
{{{contentHtml}}}
</td></tr>
{{#if hasDiscoveryLinks}}<tr><td style="padding:16px 20px;background-color:#ffffff;border-top:1px solid #e3e9ed;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
{{#if hasSocialLinks}}<td class="footer-column" align="center" valign="top" style="padding:0 10px;{{#if hasAppLinks}}width:34%;border-right:1px solid #e3e9ed;{{/if}}font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 8px;font-size:13px;line-height:18px;font-weight:bold;color:#172b3a;">Follow us</p>
{{#each brand.socialLinks}}<a href="{{url}}" style="display:inline-block;margin:0 3px 2px;text-decoration:none;"><img src="{{iconUrl}}" alt="{{label}}" width="26" height="26" style="display:block;width:26px;height:26px;border:0;"></a>{{/each}}
</td>{{/if}}
{{#if hasAppLinks}}<td class="footer-column" align="center" valign="top" style="padding:0 10px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 8px;font-size:13px;line-height:18px;font-weight:bold;color:#172b3a;">Get the Elexify app</p>
{{#if brand.iosAppUrl}}<a class="app-link" href="{{brand.iosAppUrl}}" style="display:inline-block;margin:0 3px 2px;text-decoration:none;"><img src="{{brand.appStoreBadgeUrl}}" alt="Download on the App Store" width="108" height="36" style="display:block;width:108px;height:36px;border:0;"></a>{{/if}}
{{#if brand.androidAppUrl}}<a class="app-link" href="{{brand.androidAppUrl}}" style="display:inline-block;margin:0 3px 2px;text-decoration:none;"><img src="{{brand.googlePlayBadgeUrl}}" alt="Get it on Google Play" width="121" height="36" style="display:block;width:121px;height:36px;border:0;object-fit:contain;"></a>{{/if}}
</td>{{/if}}
</tr></table></td></tr>{{/if}}
<tr><td class="email-footer" align="center" style="padding:16px 24px;background-color:#f8fafb;border-top:1px solid #e3e9ed;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 4px;font-size:13px;line-height:18px;font-weight:bold;color:#172b3a;">{{brand.brandName}}</p>
{{#if brand.companyAddress}}<p style="margin:0 0 14px;font-size:12px;line-height:20px;color:#647784;">{{brand.companyAddress}}</p>{{/if}}
<p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#647784;">Need help? <a href="mailto:{{brand.supportEmail}}" style="color:#087f73;text-decoration:none;font-weight:bold;">{{brand.supportEmail}}</a>{{#if brand.supportPhone}}<br>{{brand.supportPhone}}{{/if}}</p>
<p style="margin:0 0 6px;font-size:11px;line-height:20px;">
<a class="footer-link" href="mailto:{{brand.supportEmail}}" style="color:#087f73;text-decoration:none;margin:0 8px;">Contact Us</a><span style="color:#ccd7de;">|</span>
<a class="footer-link" href="{{brand.privacyUrl}}" style="color:#087f73;text-decoration:none;margin:0 8px;">Privacy Policy</a><span style="color:#ccd7de;">|</span>
{{#if unsubscribeUrl}}<a class="footer-link" href="{{unsubscribeUrl}}" aria-label="Unsubscribe from newsletter emails" style="color:#087f73;text-decoration:none;margin:0 8px;">Unsubscribe</a>{{else}}<a class="footer-link" href="{{brand.termsUrl}}" style="color:#087f73;text-decoration:none;margin:0 8px;">Terms &amp; Conditions</a>{{/if}}</p>
{{#if isMarketing}}<p style="margin:8px 0 4px;font-size:11px;line-height:19px;color:#647784;">You subscribed to {{brand.brandName}} updates.</p>{{/if}}
{{#unless unsubscribeUrl}}{{#if isMarketing}}<p style="margin:0 0 6px;font-size:11px;line-height:19px;color:#647784;">Preview only. Unsubscribe appears in sent emails.</p>{{/if}}{{/unless}}
{{#if showPreferencesLink}}<p style="margin:0 0 12px;font-size:12px;line-height:20px;"><a href="{{brand.preferencesUrl}}" style="color:#526673;text-decoration:underline;">Manage communication preferences</a></p>{{/if}}
<p style="margin:8px 0 0;font-size:11px;line-height:18px;color:#83929c;">&copy; {{year}} {{brand.brandName}}. All rights reserved.</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
const compiledShell = Handlebars.compile(SHELL_SOURCE, { noEscape: false });
export const renderEmailShell = ({ subject, preheaderText, brand, contentHtml, showPreferencesLink = false, isMarketing = false, unsubscribeUrl = '', campaignLabel = '' }) =>
  compiledShell({ subject, preheaderText: preheaderText || '', brand, contentHtml, showPreferencesLink, isMarketing, unsubscribeUrl, campaignLabel,
    hasAppLinks: Boolean(brand.androidAppUrl || brand.iosAppUrl), hasSocialLinks: Boolean(brand.socialLinks?.length), hasDiscoveryLinks: Boolean(brand.androidAppUrl || brand.iosAppUrl || brand.socialLinks?.length), year: new Date().getFullYear() });
