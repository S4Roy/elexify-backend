import Handlebars from "handlebars";

// Shared, code-owned email "design system" — a small set of Handlebars
// partials registered once at import time, so every EmailTemplate body can
// compose the same visual language (`{{> ctaButton url=... text=...}}`)
// instead of hand-rolling HTML per event. Table-based layout + inline
// styles throughout for Outlook/Gmail compatibility; explicit colors (no
// reliance on `currentColor`/transparent) for dark-mode safety.

const COLORS = {
  text: "#1f2933",
  muted: "#52606d",
  border: "#e4e7eb",
  brand: "#087f73",
  brandText: "#ffffff",
  badgeBg: "#edf8f5",
  badgeText: "#16614f",
  warnBg: "#fffbeb",
  warnText: "#92400e",
  infoBg: "#eff6ff",
  infoText: "#1e40af",
};

Handlebars.registerHelper("currency", (value) => {
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

const TONE_COLORS = {
  brand: { bg: COLORS.badgeBg, text: COLORS.badgeText },
  warn: { bg: COLORS.warnBg, text: COLORS.warnText },
  info: { bg: COLORS.infoBg, text: COLORS.infoText },
};
Handlebars.registerHelper("toneBg", (tone) => (TONE_COLORS[tone] || TONE_COLORS.brand).bg);
Handlebars.registerHelper("toneText", (tone) => (TONE_COLORS[tone] || TONE_COLORS.brand).text);

const PARTIALS = {
  // {{> statusBadge label="Order Cancelled" tone="warn"}} — tone: "brand" | "warn" | "info" (default "brand")
  statusBadge: `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
  <tr>
    <td style="background-color:{{toneBg tone}};color:{{toneText tone}};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;padding:6px 12px;border-radius:20px;">
      {{label}}
    </td>
  </tr>
</table>`.trim(),

  // {{> ctaButton url=view_order_url text="View Order"}}
  ctaButton: `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
  <tr>
    <td style="border-radius:6px;background-color:${COLORS.brand};">
      <a href="{{url}}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 26px;line-height:20px;border:1px solid #087f73;background-color:#087f73;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${COLORS.brandText};text-decoration:none;border-radius:6px;">
        {{text}}
      </a>
    </td>
  </tr>
</table>`.trim(),

  // {{> infoBox text="..." tone="info"}}
  infoBox: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:{{toneBg tone}};color:{{toneText tone}};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;padding:14px 16px;border-radius:6px;">
      {{text}}
    </td>
  </tr>
</table>`.trim(),

  // {{> addressBlock heading="Shipping Address" address=shipping_address}}
  addressBlock: `
{{#if address}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
  <tr>
    <td style="font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:${COLORS.text};">{{heading}}</p>
      <p style="margin:0;font-size:13px;line-height:20px;color:${COLORS.muted};">
        {{address.name}}{{#if address.line1}}<br>{{address.line1}}{{/if}}{{#if address.line2}}<br>{{address.line2}}{{/if}}<br>
        {{address.city}}{{#if address.state}}, {{address.state}}{{/if}} {{address.pincode}}<br>
        {{address.country}}
      </p>
    </td>
  </tr>
</table>
{{/if}}`.trim(),

  // {{> otpCodeBlock code=otp}}
  otpCodeBlock: `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="background-color:${COLORS.badgeBg};border-radius:6px;padding:16px 28px;">
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:bold;letter-spacing:8px;color:${COLORS.text};">{{code}}</span>
    </td>
  </tr>
</table>`.trim(),

  // {{> stockItemsTable}} — admin low-stock digest: expects stock_items[]
  // (product_name, variation_name, sku, stock_quantity, level_label, waiting).
  stockItemsTable: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border:1px solid ${COLORS.border};border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
  <tr style="background:#f5f7fa;color:${COLORS.muted};"><td style="padding:8px 12px;">Product</td><td style="padding:8px 12px;text-align:right;">Stock</td><td style="padding:8px 12px;text-align:right;">Waiting</td></tr>
  {{#each stock_items}}
  <tr>
    <td style="padding:8px 12px;border-top:1px solid ${COLORS.border};color:${COLORS.text};">{{this.product_name}}{{#if this.variation_name}}<br><span style="color:${COLORS.muted};font-size:12px;">{{this.variation_name}}</span>{{/if}}{{#if this.sku}}<br><span style="color:${COLORS.muted};font-size:12px;">SKU {{this.sku}}</span>{{/if}}</td>
    <td style="padding:8px 12px;border-top:1px solid ${COLORS.border};text-align:right;white-space:nowrap;"><strong>{{this.stock_quantity}}</strong><br><span style="color:${COLORS.muted};font-size:12px;">{{this.level_label}}</span></td>
    <td style="padding:8px 12px;border-top:1px solid ${COLORS.border};text-align:right;">{{this.waiting}}</td>
  </tr>
  {{/each}}
</table>`.trim(),

  // {{> cartItemsCard}} — abandoned-cart reminder: expects items[]
  // (product_name, variation_name, quantity, unit_price, total_price),
  // more_items_count and cart_total.
  cartItemsCard: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border:1px solid ${COLORS.border};border-radius:8px;">
  <tr>
    <td style="padding:6px 20px 16px 20px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
        {{#each items}}
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.text};">
            {{this.product_name}}{{#if this.variation_name}}<br><span style="color:${COLORS.muted};font-size:12px;">{{this.variation_name}}</span>{{/if}}<br>
            <span style="color:${COLORS.muted};font-size:12px;">Qty: {{this.quantity}} × {{currency this.unit_price}}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};text-align:right;color:${COLORS.text};font-weight:bold;">{{currency this.total_price}}</td>
        </tr>
        {{/each}}
        {{#if more_items_count}}
        <tr><td colspan="2" style="padding:10px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.muted};font-size:12px;">+ {{more_items_count}} more item(s)</td></tr>
        {{/if}}
        <tr><td style="padding:10px 0 0 0;font-weight:bold;color:${COLORS.text};">Cart Total</td><td style="padding:10px 0 0 0;text-align:right;font-weight:bold;color:${COLORS.text};">{{currency cart_total}}</td></tr>
      </table>
    </td>
  </tr>
</table>`.trim(),

  // {{> orderSummaryCard}} — expects order_number, order_date, payment_method_label,
  // payment_status_label, order_status_label, items[], subtotal, discount,
  // coupon_code, shipping, grand_total, and (Partial COD only) is_partial_cod,
  // advance_amount, cod_due_amount (all pre-formatted strings/numbers on
  // the render context; `currency` helper formats numeric amounts).
  orderSummaryCard: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border:1px solid ${COLORS.border};border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;color:${COLORS.muted};">
        <tr><td style="padding:2px 0;">Order Number</td><td style="padding:2px 0;text-align:right;color:${COLORS.text};font-weight:bold;">{{order_number}}</td></tr>
        {{#if order_date}}<tr><td style="padding:2px 0;">Order Date</td><td style="padding:2px 0;text-align:right;">{{order_date}}</td></tr>{{/if}}
        {{#if payment_method_label}}<tr><td style="padding:2px 0;">Payment Method</td><td style="padding:2px 0;text-align:right;">{{payment_method_label}}</td></tr>{{/if}}
        {{#if payment_status_label}}<tr><td style="padding:2px 0;">Payment Status</td><td style="padding:2px 0;text-align:right;">{{payment_status_label}}</td></tr>{{/if}}
        {{#if order_status_label}}<tr><td style="padding:2px 0;">Order Status</td><td style="padding:2px 0;text-align:right;">{{order_status_label}}</td></tr>{{/if}}
      </table>

      {{#if items}}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-top:1px solid ${COLORS.border};font-size:13px;">
        {{#each items}}
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.text};">
            {{this.product_name}}{{#if this.variation_name}}<br><span style="color:${COLORS.muted};font-size:12px;">{{this.variation_name}}</span>{{/if}}<br>
            <span style="color:${COLORS.muted};font-size:12px;">Qty: {{this.quantity}} × {{currency this.unit_price}}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};text-align:right;color:${COLORS.text};font-weight:bold;">{{currency this.total_price}}</td>
        </tr>
        {{/each}}
      </table>
      {{/if}}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;font-size:13px;">
        <tr><td style="padding:2px 0;color:${COLORS.muted};">Subtotal</td><td style="padding:2px 0;text-align:right;color:${COLORS.text};">{{currency subtotal}}</td></tr>
        {{#if discount}}<tr><td style="padding:2px 0;color:${COLORS.muted};">Discount{{#if coupon_code}} ({{coupon_code}}){{/if}}</td><td style="padding:2px 0;text-align:right;color:${COLORS.text};">-{{currency discount}}</td></tr>{{/if}}
        {{#if shipping}}<tr><td style="padding:2px 0;color:${COLORS.muted};">Shipping</td><td style="padding:2px 0;text-align:right;color:${COLORS.text};">{{currency shipping}}</td></tr>{{/if}}
        <tr><td style="padding:8px 0 0 0;border-top:1px solid ${COLORS.border};font-weight:bold;color:${COLORS.text};">Grand Total</td><td style="padding:8px 0 0 0;border-top:1px solid ${COLORS.border};text-align:right;font-weight:bold;color:${COLORS.text};">{{currency grand_total}}</td></tr>
        {{#if is_partial_cod}}
        <tr><td style="padding:4px 0 0 0;color:${COLORS.muted};">Advance Paid</td><td style="padding:4px 0 0 0;text-align:right;color:${COLORS.text};">{{currency advance_amount}}</td></tr>
        <tr><td style="padding:2px 0;color:${COLORS.muted};">Balance Due (COD)</td><td style="padding:2px 0;text-align:right;color:${COLORS.text};">{{currency cod_due_amount}}</td></tr>
        {{/if}}
        {{#if refund_amount}}<tr><td style="padding:8px 0 0 0;color:${COLORS.muted};">Refund Amount</td><td style="padding:8px 0 0 0;text-align:right;font-weight:bold;color:${COLORS.text};">{{currency refund_amount}}</td></tr>{{/if}}
      </table>
    </td>
  </tr>
</table>`.trim(),
};

for (const [name, source] of Object.entries(PARTIALS)) {
  Handlebars.registerPartial(name, source);
}

export { PARTIALS };
