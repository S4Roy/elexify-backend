import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { envs } from '../../config/index.js';
import User from '../../models/User.js';
import UserResource from '../../resources/UserResource.js';
import { validateAccessToken } from '../../middleware/accessToken.js';
import * as sessions from '../../services/customerSession/index.js';
const router = Router();
const run = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.statusCode === 401) {
      sessions.clearRefresh(res);
      return res.status(401).json({ status: 'error', success: false, code: error.code || 'AUTHENTICATION_REQUIRED', message: error.message });
    }
    next(error);
  }
};
const customerOnly = (req, res, next) => ['customer', 'user'].includes(req.auth?.role) ? next() : res.status(403).json({ status: 'error', message: 'Customer authentication required' });
const ok = (res, data = {}) => res.json({ status: 'success', success: true, message: 'Success', data });
export function sessionRequestGuard(req, res, next) {
  // Custom headers force a CORS preflight; a cross-site form cannot rotate or log out a session.
  if (req.headers['x-session-request'] !== '1') return res.status(403).json({ status: 'error', code: 'CSRF_REJECTED', message: 'Session request header required' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}
router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false }));
router.post('/refresh', sessionRequestGuard, run(async (req, res) => {
  const token = await sessions.refreshSession(req, res);
  const claims = jwt.decode(token.access_token);
  const user = await User.findById(claims.sub);
  ok(res, { token, user: new UserResource(user).exec() });
}));
router.post('/migrate-session', sessionRequestGuard, validateAccessToken, customerOnly, run(async (req, res) => {
  if (req.auth.sid || !['customer', 'user'].includes(req.auth.role)) throw sessions.authError('INVALID_ACCESS_TOKEN');
  const user = await User.findById(req.auth.user_id);
  const raw = req.headers.authorization?.split(' ')[1];
  let token;
  try { token = await sessions.createSession(user, req, res, sessions.hashToken(raw)); }
  catch (error) { if (error.code === 11000) throw sessions.authError('SESSION_REVOKED'); throw error; }
  ok(res, { token, user: new UserResource(user).exec() });
}));
router.post('/logout', sessionRequestGuard, run(async (req, res) => {
  const raw = sessions.readRefresh(req);
  let claims;
  try { claims = sessions.verifyRefresh(raw); } catch { /* repeated logout / expired cookie */ }
  if (!claims) {
    let access;
    try {
      access = jwt.verify(req.headers.authorization?.split(' ')[1], envs.jwt.accessToken.secret, { algorithms: ['HS256'] });
    } catch { /* idempotent */ }
    if (access?.type === 'access') claims = access;
    else if (access && !access.type && access.user_id) await sessions.revokeLegacyToken(req.headers.authorization.split(' ')[1], access, req);
  }
  if (claims) {
    try { await sessions.revokeSession(claims.sub, claims.sid, req, 'LOGOUT'); }
    catch (error) { if (error.statusCode !== 404) throw error; }
  }
  sessions.clearRefresh(res);
  res.json({ status: 'success', success: true, message: 'Logged out successfully' });
}));
router.post('/logout-all', sessionRequestGuard, validateAccessToken, customerOnly, run(async (req, res) => {
  await sessions.revokeAll(req.auth.user_id, req);
  sessions.clearRefresh(res); ok(res);
}));
router.get('/sessions', validateAccessToken, customerOnly, run(async (req, res) => ok(res, await sessions.sessionSummary(req.auth.user_id, req.auth.sid))));
router.delete('/sessions/:sessionId', sessionRequestGuard, validateAccessToken, customerOnly, run(async (req, res) => {
  await sessions.revokeSession(req.auth.user_id, req.params.sessionId, req);
  if (req.params.sessionId === req.auth.sid) sessions.clearRefresh(res);
  ok(res);
}));
router.get('/presence', validateAccessToken, customerOnly, run(async (req, res) => {
  const { online, lastActivityAt } = await sessions.sessionSummary(req.auth.user_id, req.auth.sid);
  ok(res, { online, lastActivityAt });
}));
export { router as customerSessionsRouter };
