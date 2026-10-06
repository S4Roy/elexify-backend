import { beforeEach, describe, expect, it, vi } from 'vitest';
const config = vi.fn();
vi.mock('./integrationCredentials/index.js', () => ({ getIntegrationConfig: () => config() }));
vi.mock('../config/index.js', () => ({ envs: { google: { clientId: 'env-client' } } }));
const { googleSignInPlatforms } = await import('./googleSignIn.js');
beforeEach(() => config.mockReset());
describe('google sign-in platforms', () => {
  it('shows every platform by default when a client ID exists', async () => {
    config.mockResolvedValue({ client_id: 'web-client' });
    expect(await googleSignInPlatforms()).toEqual({ android: true, ios: true, web: true });
  });
  it('honours per-platform admin switches', async () => {
    config.mockResolvedValue({ client_id: 'web-client', show_ios: 'false' });
    expect(await googleSignInPlatforms()).toEqual({ android: true, ios: false, web: true });
  });
  it('hides everywhere when the provider is disabled or has no client ID', async () => {
    config.mockResolvedValue(null);
    expect(await googleSignInPlatforms()).toEqual({ android: false, ios: false, web: false });
    config.mockResolvedValue({ client_id: '' });
    expect(Object.values(await googleSignInPlatforms()).some(Boolean)).toBe(false);
  });
});
