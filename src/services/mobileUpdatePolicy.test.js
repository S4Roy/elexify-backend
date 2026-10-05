import { beforeEach, describe, expect, it, vi } from 'vitest';
const findOne = vi.fn();
vi.mock('../models/MobileUpdatePolicy.js', () => ({ default: { findOne: (...args) => ({ lean: () => findOne(...args) }) } }));
const { mobileUpdatePolicy, getMobileUpdatePolicy, resolveUpdatePolicy, compareVersions } = await import('./mobileUpdatePolicy.js');
const response = () => {
  const res = { headers: {}, statusCode: 200 };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
};
const adminPolicy = {
  platform: 'android', enabled: true, latest_version: '1.6.0', minimum_version: '1.4.0',
  title: 'New version', message: 'Faster checkout', remind_after_hours: 12,
};
beforeEach(() => findOne.mockReset().mockResolvedValue(null));
describe('mobile update policy', () => {
  it('defaults to disabled and rejects unsupported platforms', () => {
    expect(mobileUpdatePolicy('android', {}).enabled).toBe(false);
    expect(mobileUpdatePolicy('web', {})).toBeNull();
  });
  it('enables configured Android releases', () => {
    expect(mobileUpdatePolicy('android', { MOBILE_ANDROID_UPDATE_ENABLED: 'true', MOBILE_ANDROID_MIN_VERSION: '1.2.0' })).toMatchObject({ enabled: true, minimumVersion: '1.2.0' });
  });
  it('rejects invalid minimum versions and missing iOS destinations', () => {
    expect(() => mobileUpdatePolicy('android', { MOBILE_ANDROID_UPDATE_ENABLED: 'true', MOBILE_ANDROID_MIN_VERSION: 'bad' })).toThrow();
    expect(() => mobileUpdatePolicy('ios', { MOBILE_IOS_UPDATE_ENABLED: 'true' })).toThrow();
    expect(mobileUpdatePolicy('ios', { MOBILE_IOS_UPDATE_ENABLED: 'true', MOBILE_IOS_STORE_URL: 'https://apps.apple.com/in/app/elexify/id123456789' }).enabled).toBe(true);
  });
  it('compares semantic versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
  });
  it('serves the admin policy with optional and forced versions to new apps', async () => {
    findOne.mockResolvedValue(adminPolicy);
    const res = await getMobileUpdatePolicy({ query: { platform: 'android', schema: '2' } }, response());
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toMatchObject({ schemaVersion: 2, enabled: true, minimumVersion: '1.4.0', latestVersion: '1.6.0', remindAfterHours: 12, title: 'New version' });
  });
  it('keeps released apps on the v1 forced-only shape', async () => {
    findOne.mockResolvedValue(adminPolicy);
    const res = await getMobileUpdatePolicy({ query: { platform: 'android' } }, response());
    expect(res.body).toEqual({ schemaVersion: 1, platform: 'android', enabled: true, minimumVersion: '1.4.0', storeUrl: 'https://play.google.com/store/apps/details?id=com.elexify' });
  });
  it('never enables an iOS policy without a valid App Store link', async () => {
    findOne.mockResolvedValue({ ...adminPolicy, platform: 'ios', store_url: 'https://evil.example' });
    expect((await resolveUpdatePolicy('ios')).enabled).toBe(false);
  });
  it('falls back to the environment policy until an admin saves one', async () => {
    const policy = await resolveUpdatePolicy('android', { MOBILE_ANDROID_UPDATE_ENABLED: 'true', MOBILE_ANDROID_MIN_VERSION: '1.2.0' });
    expect(policy).toMatchObject({ schemaVersion: 2, enabled: true, minimumVersion: '1.2.0', latestVersion: '1.2.0' });
  });
  it('rejects unsupported platforms', async () => {
    const res = await getMobileUpdatePolicy({ query: { platform: 'web' } }, response());
    expect(res.statusCode).toBe(400);
  });
});
