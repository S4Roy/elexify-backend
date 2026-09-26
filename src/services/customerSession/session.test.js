import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { envs } from '../../config/index.js';
import User from '../../models/User.js';
import CustomerSession from '../../models/CustomerSession.js';
import AuthEvent from '../../models/AuthEvent.js';
import * as service from './index.js';
const customerId = new mongoose.Types.ObjectId();
const req = { headers: { 'x-auth-client': 'native', 'user-agent': 'Android' }, ip: '127.0.0.1', body: {} };
const res = () => ({ cookie: vi.fn(), clearCookie: vi.fn(), setHeader: vi.fn() });
let session;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
  vi.spyOn(CustomerSession.prototype, 'save').mockImplementation(async function () { session = this; return this; });
  vi.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ _id: customerId, role: 'customer', status: 'active', password_changed_at: null }) }) });
  vi.spyOn(CustomerSession, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
});
async function login() { return service.createSession({ _id: customerId }, req, res()); }
function findSession() { vi.spyOn(CustomerSession, 'findOne').mockReturnValue({ select: async () => session, lean: async () => session }); }
describe('customer session security', () => {
  it('issues a short minimal access JWT and stores only the refresh hash', async () => {
    const token = await login();
    const claims = jwt.verify(token.access_token, envs.jwt.accessToken.secret);
    expect(claims.exp - claims.iat).toBe(900);
    expect(claims).toMatchObject({ sub: String(customerId), sid: String(session._id), type: 'access' });
    expect(claims.email).toBeUndefined();
    expect(session.refreshTokenHash).toBe(service.hashToken(token.refresh_token));
    expect(JSON.stringify(session)).not.toContain(token.refresh_token);
  });
  it('keeps browser refresh tokens out of JSON and sets an HttpOnly cookie', async () => {
    const response = res();
    const token = await service.createSession({ _id: customerId }, { ...req, headers: { origin: 'https://elexify.online' } }, response);
    expect(token.refresh_token).toBeUndefined();
    expect(response.cookie).toHaveBeenCalledWith('elx_refresh', expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
  });
  it('rotates using an atomic hash comparison and preserves absolute expiry', async () => {
    const token = await login(); findSession();
    const expiresAt = session.expiresAt;
    const cas = vi.spyOn(CustomerSession, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({ ...session.toObject(), ...update.$set }));
    const next = await service.refreshSession({ ...req, body: { refresh_token: token.refresh_token } }, res());
    expect(next.refresh_token).not.toBe(token.refresh_token);
    expect(cas.mock.calls[0][0].refreshTokenHash).toBe(service.hashToken(token.refresh_token));
    expect(jwt.decode(next.refresh_token).exp).toBe(Math.floor(+expiresAt / 1000));
  });
  it('revokes a session when a signed used refresh token is replayed', async () => {
    const token = await login(); findSession(); session.refreshTokenHash = 'different';
    await expect(service.refreshSession({ ...req, body: { refresh_token: token.refresh_token } }, res())).rejects.toMatchObject({ code: 'TOKEN_REUSE_DETECTED' });
    expect(CustomerSession.updateOne).toHaveBeenCalledWith({ _id: session._id }, expect.objectContaining({ $set: expect.objectContaining({ revokeReason: 'TOKEN_REUSE_DETECTED' }) }));
  });
  it('fails closed when concurrent refresh loses the compare-and-swap', async () => {
    const token = await login(); findSession();
    vi.spyOn(CustomerSession, 'findOneAndUpdate').mockResolvedValue(null);
    await expect(service.refreshSession({ ...req, body: { refresh_token: token.refresh_token } }, res())).rejects.toMatchObject({ code: 'TOKEN_REUSE_DETECTED' });
  });
  it.each(['revoked', 'absolute', 'idle', 'blocked', 'password'])('rejects %s sessions', async state => {
    const token = await login(); findSession();
    if (state === 'revoked') session.revokedAt = new Date();
    if (state === 'absolute') session.expiresAt = new Date(0);
    if (state === 'idle') session.lastActivityAt = new Date(0);
    if (state === 'blocked' || state === 'password') User.findById.mockReturnValue({ select: () => ({ lean: async () => ({ role: 'customer', status: state === 'blocked' ? 'inactive' : 'active', password_changed_at: new Date() }) }) });
    await expect(service.refreshSession({ ...req, body: { refresh_token: token.refresh_token } }, res())).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects forged tokens without querying or revoking a session', async () => {
    const find = vi.spyOn(CustomerSession, 'findOne');
    await expect(service.refreshSession({ ...req, body: { refresh_token: 'invalid' } }, res())).rejects.toMatchObject({ statusCode: 401 });
    expect(find).not.toHaveBeenCalled(); expect(CustomerSession.updateOne).not.toHaveBeenCalled();
  });
  it('rejects refresh tokens used as access tokens', async () => {
    const token = await login();
    await expect(service.validateSession(jwt.decode(token.refresh_token))).rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });
  it('scopes device revocation to the authenticated customer', async () => {
    const update = vi.spyOn(CustomerSession, 'findOneAndUpdate').mockResolvedValue(null);
    const id = String(new mongoose.Types.ObjectId());
    await expect(service.revokeSession(customerId, id, req)).rejects.toMatchObject({ statusCode: 404 });
    expect(update.mock.calls[0][0]).toEqual({ _id: id, customerId });
  });
  it('logout-all invalidates legacy credentials and every session', async () => {
    const users = vi.spyOn(User, 'updateOne').mockResolvedValue({});
    const all = vi.spyOn(CustomerSession, 'updateMany').mockResolvedValue({});
    await service.revokeAll(customerId, req);
    expect(users).toHaveBeenCalled();
    expect(all.mock.calls[0][0]).toEqual({ customerId, revokedAt: null });
  });
  it('creates independent sessions on simultaneous devices', async () => {
    const first = await login(); const second = await login();
    expect(first.session_id).not.toBe(second.session_id);
  });
});
