import { describe, it, expect } from 'vitest';
import { cleanBody, renderCampaign, audienceFilter } from './content.js';
import { failureStatus } from './delivery.js';
describe('campaign content and eligibility', () => {
  it('removes scripts, event handlers, unsafe links and remote HTTP images', () => {
    const cleaned = cleanBody('<h2>Sale</h2><script>alert(1)</script><img src="https://example.com/product.png" onerror="alert(1)"><a href="javascript:alert(1)">Click</a><img src="http://example.com/a.png"><iframe src="https://example.com"></iframe>');
    expect(cleaned).toContain('<h2>Sale</h2>');
    expect(cleaned).toContain('https://example.com/product.png');
    expect(cleaned).not.toMatch(/script|onerror|javascript|http:|iframe/);
  });
  it('excludes every non-subscribed status and respects source, cutoff and cursor', () => {
    const cutoff = new Date();
    expect(audienceFilter({ source: 'mobile', audience_cutoff: cutoff }, 'cursor')).toEqual({ status: 'subscribed', deleted_at: null, source: 'mobile', created_at: { $lte: cutoff }, _id: { $gt: 'cursor' } });
    expect(audienceFilter({ source: 'all' })).toEqual({ status: 'subscribed', deleted_at: null });
  });
  it('adds a visible escaped unsubscribe link and a plain-text alternative', () => {
    const result = renderCampaign({ subject: 'Summer', preheader: 'New arrivals', body: '<p>Hello</p>' }, 'https://example.com/unsubscribe/abc');
    expect(result.html).toContain('Unsubscribe from newsletter emails');
    expect(result.text).toContain('Unsubscribe: https://example.com/unsubscribe/abc');
  });
  it('inlines email typography and turns standalone shopping links into buttons', () => {
    const result = renderCampaign({ subject: 'Welcome', body: '<h2>Hello</h2><p>Find <a href="https://example.com/details">details</a> here.</p><p><a href="https://example.com">Explore the store</a></p>' });
    expect(result.html).toContain('font-size:30px;line-height:38px');
    expect(result.html).toContain('padding:15px 26px');
    expect(result.html).toContain('color:#ffffff;text-decoration:none;">Explore the store');
    expect(result.html).toContain('text-decoration:underline;">details');
  });
  it('does not allow editor styles or handlers to survive the email rendering pass', () => {
    const result = renderCampaign({ subject: 'Welcome', body: '<p style="position:fixed" onclick="alert(1)">Text</p>' });
    expect(result.html).not.toContain('position:fixed'); expect(result.html).not.toContain('onclick');
    expect(result.html).toContain('line-height:27px');
  });
  it('never classifies ambiguous SMTP errors as safely retryable', () => {
    expect(failureStatus({ code: 'ETIMEDOUT' })).toBe('unknown');
    expect(failureStatus({ responseCode: 550 })).toBe('failed');
  });
});
