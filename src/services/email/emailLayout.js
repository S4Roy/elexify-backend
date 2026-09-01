import Handlebars from "handlebars";
import "./emailComponents.js"; // side-effect: registers the shared partials this shell's callers rely on

// Code-owned outer shell (header/container/footer) — every rendered
// template body is wrapped in this at send time, so branding/layout is
// consistent by construction and can't be broken by an edited
// EmailTemplate row. Table-based, inline-styled, 600px max width, explicit
// colors (Outlook/Gmail/dark-mode safe).

const SHELL_SOURCE = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;color:#1f2933;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{preheaderText}}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:28px 24px 20px 24px;background-color:#ffffff;border-bottom:1px solid #e4e7eb;">
              <img src="{{brand.logoUrl}}" alt="{{brand.brandName}}" width="140" style="display:block;max-width:140px;width:100%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
              {{{contentHtml}}}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;background-color:#f9fafb;border-top:1px solid #e4e7eb;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:#1f2933;">{{brand.brandName}}</p>
              {{#if brand.companyAddress}}<p style="margin:0 0 10px 0;font-size:12px;line-height:18px;color:#52606d;">{{brand.companyAddress}}</p>{{/if}}
              <p style="margin:0 0 10px 0;font-size:12px;line-height:18px;color:#52606d;">
                Need help? <a href="mailto:{{brand.supportEmail}}" style="color:#1a56db;text-decoration:none;">{{brand.supportEmail}}</a>{{#if brand.supportPhone}} &middot; {{brand.supportPhone}}{{/if}}
              </p>
              <p style="margin:0 0 10px 0;font-size:12px;line-height:18px;">
                <a href="{{brand.accountUrl}}" style="color:#52606d;text-decoration:underline;margin-right:10px;">My Account</a>
                <a href="{{brand.ordersUrl}}" style="color:#52606d;text-decoration:underline;margin-right:10px;">Orders</a>
                <a href="mailto:{{brand.supportEmail}}" style="color:#52606d;text-decoration:underline;margin-right:10px;">Contact Us</a>
                <a href="{{brand.privacyUrl}}" style="color:#52606d;text-decoration:underline;margin-right:10px;">Privacy Policy</a>
                <a href="{{brand.termsUrl}}" style="color:#52606d;text-decoration:underline;">Terms &amp; Conditions</a>
              </p>
              {{#if showPreferencesLink}}<p style="margin:0;font-size:12px;line-height:18px;"><a href="{{brand.preferencesUrl}}" style="color:#52606d;text-decoration:underline;">Manage communication preferences</a></p>{{/if}}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

const compiledShell = Handlebars.compile(SHELL_SOURCE, { noEscape: false });

/**
 * Wraps already-rendered inner content HTML in the shared EmailShell
 * (header/logo, 600px container, footer). `contentHtml` is inserted
 * unescaped (`{{{contentHtml}}}`) since it was itself already rendered
 * through renderEmailTemplate()'s Handlebars pass — this function does not
 * re-render user/customer data, only the shell chrome around it.
 */
export const renderEmailShell = ({ subject, preheaderText, brand, contentHtml, showPreferencesLink = false }) =>
  compiledShell({ subject, preheaderText: preheaderText || "", brand, contentHtml, showPreferencesLink });
