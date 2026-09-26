import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { envs } from '../../config/index.js';
import User from '../../models/User.js';
import CustomerSession from '../../models/CustomerSession.js';
import AuthEvent from '../../models/AuthEvent.js';

const positive = (name, fallback, max) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`Invalid ${name}`);
  return value;
};
export const policy = {
  accessSeconds: positive('CUSTOMER_ACCESS_TOKEN_SECONDS', 900, 900),
  absoluteDays: positive('REFRESH_TOKEN_EXPIRES_DAYS', 30, 90),
  idleDays: positive('SESSION_IDLE_TIMEOUT_DAYS', 7, 90),
  onlineSeconds: positive('CUSTOMER_ONLINE_THRESHOLD_SECONDS', 300, 3600),
};
const COOKIE = 'elx_refresh';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
const secret = () => process.env.CUSTOMER_REFRESH_TOKEN_SECRET || envs.jwt.accessToken.secret;
export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
export const authError = code => Object.assign(new Error(code.replaceAll('_', ' ').toLowerCase()), { statusCode: 401, code });
export function activeFilter(now = new Date()) {
  return { revokedAt: null, expiresAt: { $gt: now }, lastActivityAt: { $gt: new Date(+now - policy.idleDays * 864e5) } };
}
export const isNative = req => !req.headers.origin && req.headers['x-auth-client'] === 'native';
export function readRefresh(req) {
  if (isNative(req)) return req.body?.refresh_token;
  const value = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`));
  return value?.slice(COOKIE.length + 1);
}
export const clearRefresh = res => res.clearCookie(COOKIE, cookieOptions);
export async function audit(eventType, customerId, sessionId, req, reason) {
  await AuthEvent.create({ eventType, customerId, sessionId, actorId: req?.auth?.user_id,
    ipAddress: req?.ip, userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 512), reason });
}
function tokens(session) {
  const access = jwt.sign({ sub: String(session.customerId), sid: String(session._id), type: 'access' },
    envs.jwt.accessToken.secret, { algorithm: 'HS256', expiresIn: policy.accessSeconds });
  const refresh = jwt.sign({ sub: String(session.customerId), sid: String(session._id), type: 'refresh',
    jti: crypto.randomBytes(32).toString('hex'), exp: Math.floor(+new Date(session.expiresAt) / 1000) },
    secret(), { algorithm: 'HS256', audience: 'customer-refresh' });
  return { access, refresh };
}
function deliver(pair, session, req, res) {
  const token = { access_token: pair.access, access_token_expiry: policy.accessSeconds, session_id: String(session._id) };
  if (isNative(req)) token.refresh_token = pair.refresh;
  else res.cookie(COOKIE, pair.refresh, { ...cookieOptions, expires: new Date(session.expiresAt) });
  res.setHeader('Cache-Control', 'no-store');
  return token;
}
export async function createSession(user, req, res, legacyTokenHash) {
  const now = new Date();
  const ua = String(req.headers['user-agent'] || '').slice(0, 512);
  const session = new CustomerSession({ legacyTokenHash, customerId: user._id, credentialChangedAt: user.password_changed_at || null,
    deviceId: String(req.headers['x-device-id'] || crypto.randomUUID()).slice(0, 128),
    deviceName: isNative(req) ? 'Mobile app' : 'Browser', deviceType: /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop',
    browser: /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown',
    os: /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : 'Unknown',
    ipAddress: req.ip, userAgent: ua, lastActivityAt: now, lastRefreshAt: now,
    expiresAt: new Date(+now + policy.absoluteDays * 864e5),
  });
  const pair = tokens(session);
  session.refreshTokenHash = hashToken(pair.refresh);
  await session.save();
  await audit('LOGIN', user._id, session._id, req);
  return deliver(pair, session, req, res);
}
async function checkAccount(session) {
  const user = await User.findById(session.customerId).select('role status deleted_at password_changed_at').lean();
  if (!user || user.deleted_at || user.status !== 'active' || !['customer', 'user'].includes(user.role)) throw authError('ACCOUNT_INACTIVE');
  if (+new Date(user.password_changed_at || 0) !== +new Date(session.credentialChangedAt || 0)) throw authError('SESSION_REVOKED');
  return user;
}
export function verifyRefresh(raw) {
  try {
    const claims = jwt.verify(raw, secret(), { algorithms: ['HS256'], audience: 'customer-refresh' });
    if (claims.type !== 'refresh' || !mongoose.isValidObjectId(claims.sid) || !mongoose.isValidObjectId(claims.sub)) throw Error();
    return claims;
  } catch (error) { throw authError(error.name === 'TokenExpiredError' ? 'REFRESH_TOKEN_EXPIRED' : 'REFRESH_TOKEN_REVOKED'); }
}
export async function refreshSession(req, res) {
  const raw = readRefresh(req);
  const claims = verifyRefresh(raw);
  const session = await CustomerSession.findOne({ _id: claims.sid, customerId: claims.sub }).select('+refreshTokenHash');
  if (!session || session.revokedAt) throw authError('SESSION_REVOKED');
  if (+session.expiresAt <= Date.now() || +session.lastActivityAt <= Date.now() - policy.idleDays * 864e5) throw authError('REFRESH_TOKEN_EXPIRED');
  await checkAccount(session);
  if (session.refreshTokenHash !== hashToken(raw)) {
    await CustomerSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokeReason: 'TOKEN_REUSE_DETECTED' } });
    await audit('TOKEN_REUSE_DETECTED', session.customerId, session._id, req);
    throw authError('TOKEN_REUSE_DETECTED');
  }
  const pair = tokens(session);
  const updated = await CustomerSession.findOneAndUpdate({ _id: session._id, refreshTokenHash: hashToken(raw), ...activeFilter() },
    { $set: { refreshTokenHash: hashToken(pair.refresh), lastRefreshAt: new Date(), lastActivityAt: new Date() }, $inc: { tokenVersion: 1 } }, { new: true });
  if (!updated) {
    await CustomerSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokeReason: 'TOKEN_REUSE_DETECTED' } });
    await audit('TOKEN_REUSE_DETECTED', session.customerId, session._id, req);
    throw authError('TOKEN_REUSE_DETECTED');
  }
  await checkAccount(updated);
  await audit('TOKEN_REFRESH', session.customerId, session._id, req);
  return deliver(pair, updated, req, res);
}
export async function validateSession(claims, req) {
  if (claims.type !== 'access' || !mongoose.isValidObjectId(claims.sid) || !mongoose.isValidObjectId(claims.sub)) throw authError('INVALID_ACCESS_TOKEN');
  const session = await CustomerSession.findOne({ _id: claims.sid, customerId: claims.sub, ...activeFilter() }).lean();
  if (!session) throw authError('SESSION_REVOKED');
  const user = await checkAccount(session);
  await CustomerSession.updateOne({ _id: session._id, ...activeFilter(), lastActivityAt: { $lt: new Date(Date.now() - 30000), $gt: new Date(Date.now() - policy.idleDays * 864e5) } }, { $set: { lastActivityAt: new Date() } });
  if (req) { req.customer = user; req.session = session; }
  return { ...claims, user_id: claims.sub, role: user.role };
}
export async function revokeAll(customerId, req, reason = 'LOGOUT_ALL') {
  // Also invalidates legacy JWTs and sessions created concurrently with this operation.
  await User.updateOne({ _id: customerId }, { $set: { password_changed_at: new Date() } });
  await CustomerSession.updateMany({ customerId, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
  await audit(reason, customerId, null, req);
}
export async function revokeSession(customerId, sessionId, req, reason = 'SESSION_REVOKED') {
  if (!mongoose.isValidObjectId(sessionId)) throw Object.assign(new Error('Invalid session id'), { statusCode: 400 });
  const session = await CustomerSession.findOneAndUpdate({ _id: sessionId, customerId },
    { $set: { revokedAt: new Date(), logoutAt: new Date(), revokeReason: reason } });
  if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  if (!session.revokedAt) await audit(reason, customerId, sessionId, req);
}
export async function sessionSummary(customerId, currentSid, pagination) {
  const filter = { customerId: new mongoose.Types.ObjectId(customerId), ...activeFilter() };
  const projection = { deviceName: 1, deviceType: 1, browser: 1, os: 1, lastActivityAt: 1, createdAt: 1, expiresAt: 1 };
  const result = pagination ? await CustomerSession.aggregatePaginate(CustomerSession.aggregate([
    { $match: filter }, { $sort: { lastActivityAt: -1, _id: -1 } }, { $project: projection },
  ]), pagination) : null;
  const sessions = result ? result.docs : await CustomerSession.find(filter)
    .select(projection).sort({ lastActivityAt: -1, _id: -1 }).limit(100).lean();
  const latestActive = pagination ? await CustomerSession.findOne(filter).sort({ lastActivityAt: -1 }).select('lastActivityAt').lean() : sessions[0];
  const latest = await CustomerSession.findOne({ customerId }).sort({ lastActivityAt: -1 }).select('lastActivityAt').lean();
  const docs = sessions.map(s => ({ ...s, id: String(s._id), isCurrent: String(s._id) === String(currentSid) }));
  return { ...(result ? { ...result, docs } : { sessions: docs }),
    online: !!latestActive && +latestActive.lastActivityAt > Date.now() - policy.onlineSeconds * 1000,
    lastActivityAt: latest?.lastActivityAt || null };
}

export async function batchPresence(customerIds) {
  const now = new Date();
  const active = { $and: [ { $eq: ['$revokedAt', null] }, { $gt: ['$expiresAt', now] },
    { $gt: ['$lastActivityAt', new Date(+now - policy.idleDays * 864e5)] } ] };
  const rows = await CustomerSession.aggregate([
    { $match: { customerId: { $in: customerIds } } },
    { $group: { _id: '$customerId', lastActivityAt: { $max: '$lastActivityAt' },
      activeDevices: { $sum: { $cond: [active, 1, 0] } },
      lastActiveAt: { $max: { $cond: [active, '$lastActivityAt', null] } } } },
  ]);
  return new Map(rows.map(({ lastActiveAt, ...row }) => [String(row._id), { ...row, online: +lastActiveAt > Date.now() - policy.onlineSeconds * 1000 }]));
}

export async function validateLegacyToken(claims, token) {
  if (!['customer', 'user'].includes(claims.role)) return;
  const cutoff = process.env.CUSTOMER_LEGACY_TOKEN_DEADLINE;
  if ((cutoff && Date.now() >= Date.parse(cutoff)) || !claims.iat || Date.now() >= (claims.iat + 7 * 86400) * 1000) throw authError('SESSION_REVOKED');
  if (await CustomerSession.exists({ legacyTokenHash: hashToken(token) })) throw authError('SESSION_REVOKED');
}

export async function cleanupSessions() {
  const now = new Date();
  return CustomerSession.updateMany({ revokedAt: null, $or: [
    { expiresAt: { $lte: now } }, { lastActivityAt: { $lte: new Date(+now - policy.idleDays * 864e5) } },
  ] }, { $set: { revokedAt: now, revokeReason: 'SESSION_EXPIRED' } });
}

export async function revokeLegacyToken(raw, claims, req) {
  if (!['customer', 'user'].includes(claims.role) || !mongoose.isValidObjectId(claims.user_id) || !Number.isFinite(claims.exp)) return;
  const now = new Date();
  const session = await CustomerSession.findOneAndUpdate({ legacyTokenHash: hashToken(raw) }, {
    $set: { revokedAt: now, logoutAt: now, revokeReason: 'LOGOUT' },
    $setOnInsert: { customerId: claims.user_id, refreshTokenHash: hashToken(raw), lastActivityAt: now, lastRefreshAt: now,
      expiresAt: new Date(claims.exp * 1000), deviceName: 'Legacy device' },
  }, { upsert: true, new: true });
  await audit('LOGOUT', claims.user_id, session._id, req);
}
