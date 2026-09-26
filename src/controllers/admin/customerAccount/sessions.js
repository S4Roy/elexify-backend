import mongoose from 'mongoose';
import User from '../../../models/User.js';
import AuthEvent from '../../../models/AuthEvent.js';
import * as sessions from '../../../services/customerSession/index.js';
const handler = fn => async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Invalid customer id' });
    const customer = await User.findOne({ _id: req.params.id, role: { $in: ['customer', 'user'] } }).select('_id').lean();
    if (!customer) return res.status(404).json({ status: 'error', message: 'Customer not found' });
    await fn(req, res);
  } catch (error) { next(error); }
};
export const listSessions = handler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'success', data: await sessions.sessionSummary(req.params.id, undefined, { page: Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1))), limit: 5 }) });
});
export const securityEvents = handler(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
  const data = await AuthEvent.aggregatePaginate(AuthEvent.aggregate([
    { $match: { customerId: new mongoose.Types.ObjectId(req.params.id) } },
    { $sort: { createdAt: -1, _id: -1 } },
  ]), { page, limit: 10 });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'success', data });
});
export const revoke = handler(async (req, res) => {
  if (typeof req.body.reason !== 'string' || req.body.reason.trim().length < 10 || req.body.reason.length > 500) return res.status(400).json({ status: 'error', message: 'Provide a reason (10–500 characters)' });
  if (req.params.sessionId) await sessions.revokeSession(req.params.id, req.params.sessionId, req, 'ADMIN_SESSION_REVOKED');
  else await sessions.revokeAll(req.params.id, req, 'ADMIN_LOGOUT_ALL');
  await sessions.audit('ADMIN_ACTION_REASON', req.params.id, req.params.sessionId, req, req.body.reason.trim());
  res.json({ status: 'success', message: 'Customer sessions revoked' });
});
