import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import User from '../../models/User.js';
import CustomerSession from '../../models/CustomerSession.js';
import AuthEvent from '../../models/AuthEvent.js';
import * as service from './index.js';
const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, '/elexify_session_integration$1');
const suite = uri ? describe : describe.skip;
const response = { cookie() {}, clearCookie() {}, setHeader() {} };
const req = { headers: { 'x-auth-client': 'native' }, body: {}, ip: '127.0.0.1' };
suite('MongoDB customer session integration', () => {
  beforeAll(async () => { await mongoose.connect(uri); await CustomerSession.init(); });
  beforeEach(async () => { await Promise.all([User.deleteMany({}), CustomerSession.deleteMany({}), AuthEvent.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); });
  const user = () => User.create({ name: 'Session test', role: 'customer', status: 'active' });
  it('revokes only one device then revokes all remaining devices', async () => {
    const customer = await user();
    const a = await service.createSession(customer, req, response);
    const b = await service.createSession(customer, req, response);
    await service.revokeSession(customer._id, a.session_id, req);
    await expect(service.validateSession(jwt.decode(a.access_token))).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await expect(service.validateSession(jwt.decode(b.access_token))).resolves.toMatchObject({ user_id: String(customer._id) });
    await service.revokeAll(customer._id, req);
    await expect(service.refreshSession({ ...req, body: { refresh_token: b.refresh_token } }, response)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  it('paginates admin devices and events without losing global presence or customer isolation', async () => {
    const customer = await user();
    const other = await user();
    for (let i = 0; i < 6; i++) await service.createSession(customer, req, response);
    await service.createSession(other, req, response);
    const records = await CustomerSession.find({ customerId: customer._id }).sort({ _id: -1 });
    await CustomerSession.updateMany({ customerId: customer._id }, { lastActivityAt: new Date(Date.now() - 600000) });
    await CustomerSession.updateOne({ _id: records[0]._id }, { lastActivityAt: new Date() });
    const { listSessions, securityEvents } = await import('../../controllers/admin/customerAccount/sessions.js');
    async function invoke(handler, page) {
      let body;
      await handler({ params: { id: String(customer._id) }, query: { page } }, { setHeader() {}, json(value) { body = value; } }, error => { throw error; });
      return body.data;
    }
    const first = await invoke(listSessions, '1');
    const second = await invoke(listSessions, '2');
    expect(first).toMatchObject({ totalDocs: 6, page: 1, limit: 5, totalPages: 2, hasNextPage: true, online: true });
    expect(first.docs).toHaveLength(5);
    expect(first.docs[0]).not.toHaveProperty('refreshTokenHash');
    expect(first.docs[0]).not.toHaveProperty('legacyTokenHash');
    expect(second.docs).toHaveLength(1);
    expect(second.online).toBe(true);
    expect(first.docs.map(s => s.id)).not.toContain(second.docs[0].id);
    for (let i = 0; i < 6; i++) await service.audit('TEST_EVENT', customer._id, null, req);
    const eventsFirst = await invoke(securityEvents, '1');
    const eventsSecond = await invoke(securityEvents, '2');
    expect(eventsFirst).toMatchObject({ totalDocs: 12, page: 1, limit: 10, totalPages: 2, hasNextPage: true });
    expect(eventsFirst.docs).toHaveLength(10);
    expect(eventsSecond.docs).toHaveLength(2);
    expect(eventsFirst.docs.map(e => String(e._id))).not.toContain(String(eventsSecond.docs[0]._id));
  });
  it('filters the entire customer directory before pagination by presence, contact and orders', async () => {
    const { customerDirectoryFilters, customerDirectorySort } = await import('../../helpers/customerDirectoryFilters.js');
    const Order = (await import('../../models/Order.js')).default;
    const online = await user(); const quiet = await user(); const never = await user();
    await User.updateOne({ _id: online._id }, { email: 'directory@example.com' });
    await service.createSession(online, req, response);
    const old = await service.createSession(quiet, req, response);
    await CustomerSession.updateOne({ _id: old.session_id }, { lastActivityAt: new Date(Date.now() - 600000) });
    const ids = [online._id, quiet._id, never._id];
    try {
      await Order.collection.insertMany([{ user: online._id }, { user: online._id }, { user: quiet._id }, { user: never._id, deleted_at: new Date() }].map(order => ({ ...order, id: String(new mongoose.Types.ObjectId()) })));
      const find = query => User.aggregate([{ $match: { _id: { $in: ids } } }, ...customerDirectoryFilters(query)]);
      expect((await find({ presence: 'online', has_email: 'yes', order_activity: 'repeat' })).map(x => String(x._id))).toEqual([String(online._id)]);
      expect((await find({ presence: 'offline', active_sessions: 'yes', order_activity: 'one' })).map(x => String(x._id))).toEqual([String(quiet._id)]);
      expect((await find({ active_sessions: 'no', order_activity: 'none', has_mobile: 'no' })).map(x => String(x._id))).toEqual([String(never._id)]);
      expect(await find({ presence: 'online', active_sessions: 'no' })).toHaveLength(0);
      const page = await User.aggregatePaginate(User.aggregate([{ $match: { _id: { $in: ids } } }, ...customerDirectoryFilters({ presence: 'offline' })]), { page: 1, limit: 1 });
      expect(page.totalDocs).toBe(2); expect(page.docs).toHaveLength(1);
      for (const field of ['order_activity', 'session_activity']) {
        const sorted = direction => User.aggregatePaginate(User.aggregate([{ $match: { _id: { $in: ids } } }, ...customerDirectorySort(field, direction)]), { page: 1, limit: 1 });
        expect(String((await sorted(-1)).docs[0]._id)).toBe(String(online._id));
        expect(String((await sorted(1)).docs[0]._id)).toBe(String(never._id));
      }
      await User.updateOne({ _id: never._id }, { status: 'inactive' });
      const statusSorted = await User.aggregate([{ $match: { _id: { $in: ids } } }, ...customerDirectorySort('status', -1)]);
      expect(String(statusSorted[0]._id)).toBe(String(never._id));
      const sourceSorted = await User.aggregate([{ $match: { _id: { $in: ids } } }, { $addFields: { imported_from_backup: { $eq: ['$_id', quiet._id] } } }, ...customerDirectorySort('source', 1)]);
      expect(String(sourceSorted[0]._id)).toBe(String(quiet._id));
      expect(() => customerDirectoryFilters({ presence: 'invalid' })).toThrow();
    } finally { await Order.deleteMany({ user: { $in: ids } }); }
  });
  it('allows one atomic rotation and treats concurrent reuse as compromise', async () => {
    const customer = await user(); const token = await service.createSession(customer, req, response);
    const results = await Promise.allSettled([1, 2].map(() => service.refreshSession({ ...req, body: { refresh_token: token.refresh_token } }, response)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await CustomerSession.findById(token.session_id)).revokedAt).toBeTruthy();
  });
  it('denies cross-customer revocation and marks quiet authenticated customers offline', async () => {
    const customer = await user(); const other = await user();
    const token = await service.createSession(customer, req, response);
    await expect(service.revokeSession(other._id, token.session_id, req)).rejects.toMatchObject({ statusCode: 404 });
    await CustomerSession.updateOne({ _id: token.session_id }, { lastActivityAt: new Date(Date.now() - 10 * 60000) });
    const summary = await service.sessionSummary(customer._id);
    expect(summary.online).toBe(false); expect(summary.sessions).toHaveLength(1);
  });
});

suite('customer session HTTP routes', () => {
  let app;
  let request;
  beforeAll(async () => {
    await mongoose.connect(uri);
    await CustomerSession.init();
    const express = (await import('express')).default;
    request = (await import('supertest')).default;
    const { customerSessionsRouter } = await import('../../routes/auth/sessions.js');
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.__ = text => text; next(); });
    app.use('/auth', customerSessionsRouter);
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  });
  beforeEach(async () => { await Promise.all([User.deleteMany({}), CustomerSession.deleteMany({}), AuthEvent.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); });
  async function login() {
    const customer = await User.create({ name: 'HTTP test', role: 'customer', status: 'active' });
    return service.createSession(customer, req, response);
  }
  it('requires CSRF protection, rotates, and treats repeated logout as success', async () => {
    const token = await login();
    await request(app).post('/auth/refresh').send({ refresh_token: token.refresh_token }).expect(403);
    const refreshed = await request(app).post('/auth/refresh').set('x-session-request', '1').set('x-auth-client', 'native').send({ refresh_token: token.refresh_token }).expect(200);
    const next = refreshed.body.data.token;
    expect(next.access_token).toBeTruthy();
    for (const repeat of [1, 2]) {
      await request(app).post('/auth/logout').set('x-session-request', '1').set('x-auth-client', 'native').send({ refresh_token: next.refresh_token }).expect(200);
    }
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${next.access_token}`).expect(401);
  });
  it('never allows customer A to revoke customer B device', async () => {
    const a = await login(); const b = await login();
    await request(app).delete(`/auth/sessions/${b.session_id}`).set('Authorization', `Bearer ${a.access_token}`).set('x-session-request', '1').expect(404);
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${b.access_token}`).expect(200);
  });
  it('exchanges a legacy token once and rejects it after migration', async () => {
    const { envs } = await import('../../config/index.js');
    const customer = await User.create({ name: 'Legacy test', role: 'customer', status: 'active' });
    const legacy = jwt.sign({ user_id: String(customer._id), role: 'customer' }, envs.jwt.accessToken.secret, { expiresIn: 3600 });
    const first = await request(app).post('/auth/migrate-session').set('Authorization', `Bearer ${legacy}`).set('x-session-request', '1').set('x-auth-client', 'native').send({}).expect(200);
    expect(first.body.data.token.session_id).toBeTruthy();
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${legacy}`).expect(401);
    await request(app).post('/auth/migrate-session').set('Authorization', `Bearer ${legacy}`).set('x-session-request', '1').send({}).expect(401);
  });
  it('logout invalidates an unexchanged legacy token idempotently', async () => {
    const { envs } = await import('../../config/index.js');
    const customer = await User.create({ name: 'Legacy logout', role: 'customer', status: 'active' });
    const legacy = jwt.sign({ user_id: String(customer._id), role: 'customer' }, envs.jwt.accessToken.secret, { expiresIn: 3600 });
    for (const repeat of [1, 2]) await request(app).post('/auth/logout').set('Authorization', `Bearer ${legacy}`).set('x-session-request', '1').send({}).expect(200);
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${legacy}`).expect(401);
  });
  it('admin deactivation revokes sessions permanently, including after reactivation', async () => {
    const token = await login();
    const id = jwt.decode(token.access_token).sub;
    const { changeStatus } = await import('../../controllers/admin/customer/change-status.js');
    const res = { status() { return this; }, json() { return this; } };
    await changeStatus({ body: { _id: id, status: 'inactive' }, auth: { user_id: id }, __: value => value }, res, error => { throw error; });
    await User.updateOne({ _id: id }, { status: 'active' });
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${token.access_token}`).expect(401);
    expect(await AuthEvent.countDocuments({ customerId: id, eventType: 'ACCOUNT_LOCKED' })).toBe(1);
  });
  it('admin deletion targets the customer and makes every credential unusable', async () => {
    const token = await login();
    const id = jwt.decode(token.access_token).sub;
    const { remove } = await import('../../controllers/admin/customer/remove.js');
    await remove({ params: { id }, body: {}, auth: { user_id: id } }, { json() {} }, error => { throw error; });
    expect((await User.findById(id)).deleted_at).toBeTruthy();
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${token.access_token}`).expect(401);
  });
  it('rejects invalid signatures and expired access JWTs', async () => {
    const token = await login();
    const claims = jwt.decode(token.access_token);
    const { envs } = await import('../../config/index.js');
    const expired = jwt.sign({ sub: claims.sub, sid: claims.sid, type: 'access' }, envs.jwt.accessToken.secret, { expiresIn: -1 });
    const result = await request(app).get('/auth/sessions').set('Authorization', `Bearer ${expired}`).expect(401);
    expect(result.body.code).toBe('ACCESS_TOKEN_EXPIRED');
    await request(app).get('/auth/sessions').set('Authorization', `Bearer ${token.access_token}invalid`).expect(401);
  });
});
