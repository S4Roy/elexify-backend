import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../models/EmailTemplate.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../../services/email/resolveEmailBrand.js', () => ({ resolveEmailBrand: vi.fn(async () => ({ brandName: 'Elexify', logoUrl: 'https://example.com/logo.png', supportEmail: 'support@example.com', androidAppUrl: 'https://play.google.com/store/apps/details?id=com.elexify' })) }));
import EmailTemplate from '../../../models/EmailTemplate.js';
import { preview } from './preview.js';
import { TEMPLATES } from '../../../constants/emailTemplateDefaults.js';
beforeEach(() => vi.clearAllMocks());
it('renders unsaved draft content with the same dynamic app footer as sending', async () => {
  EmailTemplate.findOne.mockReturnValue({ lean: async () => TEMPLATES.order_placed });
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; const next = vi.fn();
  await preview({ params: { action: 'order_placed' }, body: { subject: 'Draft — {{order_id}}' }, __: s => s }, res, next);
  expect(next).not.toHaveBeenCalled();
  const data = res.json.mock.calls[0][0].data;
  expect(data.subject).toBe('Draft — ORD-DEMO-1001');
  expect(data.html).toContain('Get it on Google Play');
  expect(data.html).not.toContain('Refund Amount');
  expect(data.html).not.toContain('Unsubscribe from newsletter emails');
});
