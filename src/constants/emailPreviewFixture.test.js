import { describe, expect, it } from 'vitest';
import { emailPreviewFixture } from './emailPreviewFixture.js';
import { TEMPLATES } from './emailTemplateDefaults.js';
import { renderEmailTemplate } from '../services/email/renderEmailTemplate.js';
describe('transactional preview data', () => {
  it('shows a pending COD payment and no refund on order confirmation', () => {
    const fixture = emailPreviewFixture('order_placed');
    expect(fixture).toMatchObject({ is_cod: true, payment_status_label: 'Pending', refund_amount: 0 });
    const rendered = renderEmailTemplate(TEMPLATES.order_placed, fixture);
    expect(rendered.body).not.toContain('Refund Amount');
  });
  it('uses paid online-payment data for payment-success and refunds', () => {
    expect(emailPreviewFixture('payment_success')).toMatchObject({ is_cod: false, payment_status_label: 'Paid' });
    expect(emailPreviewFixture('refund_completed')).toMatchObject({ is_cod: false, payment_status_label: 'Refunded', refund_amount: 1575 });
  });
  it('renders every default with complete event-specific data', () => {
    for (const [action, template] of Object.entries(TEMPLATES)) {
      const rendered = renderEmailTemplate(template, emailPreviewFixture(action));
      expect(rendered.missingVariables, action).toEqual([]); expect(rendered.unresolvedFields, action).toEqual([]);
    }
  });
});
