vi.mock('../../models/SiteSetting.js', () => ({ default: { find: () => ({ select: () => ({ lean: mocks.settings }) }) } }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ readyState: 1, links: vi.fn(), settings: vi.fn() }));
vi.mock('mongoose', () => ({ default: { connection: { get readyState() { return mocks.readyState; } } } }));
vi.mock('../mobileUpdatePolicy.js', () => ({ websiteAppLinks: mocks.links,
  validStoreUrl: (platform, url) => platform === 'android' ? url === 'https://play.google.com/store/apps/details?id=com.elexify' : /^https:\/\/apps\.apple\.com\/app\/id\d+$/.test(url || '') }));
describe('email app settings', () => {
  beforeEach(() => { vi.resetModules(); mocks.readyState = 1; mocks.links.mockReset(); mocks.settings.mockResolvedValue([]); });
  it('uses only enabled validated storefront links and caches reads', async () => {
    mocks.links.mockResolvedValue({ android: 'https://play.google.com/store/apps/details?id=com.elexify', ios: 'javascript:alert(1)' });
    const { resolveEmailBrand } = await import('./resolveEmailBrand.js');
    const brand = await resolveEmailBrand();
    expect(brand.androidAppUrl).toContain('com.elexify'); expect(brand.iosAppUrl).toBe('');
    await resolveEmailBrand(); expect(mocks.links).toHaveBeenCalledTimes(1);
  });
  it('includes configured HTTPS social profiles and ignores unsafe values', async () => {
    mocks.links.mockResolvedValue({});
    mocks.settings.mockResolvedValue([{ slug: 'social_instagram_url', value: 'https://instagram.com/example' }, { slug: 'social_facebook_url', value: 'javascript:alert(1)' }]);
    const { resolveEmailBrand } = await import('./resolveEmailBrand.js');
    const brand = await resolveEmailBrand();
    expect(brand.socialLinks).toHaveLength(1);
    expect(brand.socialLinks[0]).toMatchObject({ label: 'Instagram', url: 'https://instagram.com/example' });
  });
  it('falls back to the company address from Settings when the env var is unset', async () => {
    mocks.links.mockResolvedValue({});
    mocks.settings.mockResolvedValue([{ slug: 'company_address', value: ' 57, T.N. Banerjee Road, Kolkata ' }]);
    const { resolveEmailBrand } = await import('./resolveEmailBrand.js');
    const brand = await resolveEmailBrand();
    expect(brand.companyAddress).toBe(process.env.EMAIL_BRAND_COMPANY_ADDRESS?.trim() || '57, T.N. Banerjee Road, Kolkata');
    expect(brand.socialLinks).toEqual([]);
  });
  it('keeps email sending available when optional app settings cannot be read', async () => {
    mocks.links.mockRejectedValue(new Error('settings unavailable'));
    const { resolveEmailBrand } = await import('./resolveEmailBrand.js');
    expect((await resolveEmailBrand()).androidAppUrl).toBeUndefined();
  });
  it('does not read database settings in offline rendering', async () => {
    mocks.readyState = 0;
    const { resolveEmailBrand } = await import('./resolveEmailBrand.js');
    await resolveEmailBrand(); expect(mocks.links).not.toHaveBeenCalled();
  });
});
