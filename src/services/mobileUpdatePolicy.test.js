import { describe, expect, it } from 'vitest';
import { mobileUpdatePolicy, getMobileUpdatePolicy } from './mobileUpdatePolicy.js';
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
  it('serves uncached bootstrap policy without authentication', () => {
    const res = { set: (key, value) => { expect([key, value]).toEqual(['Cache-Control', 'no-store']); }, json: value => value };
    expect(getMobileUpdatePolicy({ query: { platform: 'android' } }, res).platform).toBe('android');
  });
});
