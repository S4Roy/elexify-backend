import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { errors } from 'celebrate';
import User from '../../models/User.js';
import Role from '../../models/Role.js';
import Permission from '../../models/Permission.js';
import AuditLog from '../../models/AuditLog.js';
import { ensureOwnerAccess } from './owner.js';
import { migrateRbac } from './migrate.js';
import { roleRouter } from '../../routes/admin/role.js';
import { userAdminAccessControl } from '../../middleware/userAdminAccessControl.js';
import { requirePermission } from '../../middleware/requirePermission.js';
const uri = process.env.RBAC_TEST_MONGO_URI;
// This suite only accepts the isolated local database name; never the application's URI.
if (uri && !/^mongodb:\/\/127\.0\.0\.1:27028\/elexify_rbac_test(?:\?|$)/.test(uri)) throw new Error('Unsafe RBAC test database');
const suite = uri ? describe : describe.skip;
suite('RBAC transactional HTTP integration', () => {
  let owner, staff, custom, app;
  beforeAll(async () => {
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
    await User.init(); await AuditLog.init();
    owner = await User.create({ name: 'Owner', role: 'superadmin', email: 'baseweb.in@gmail.com' });
    staff = await User.create({ name: 'Legacy Staff', role: 'staff', email: 'staff@rbac.test' });
    await migrateRbac();
    app = express(); app.use(express.json());
    // Authentication fixture supplies identity only; real authorization queries MongoDB.
    app.use((req, res, next) => { if (req.headers['x-test-user']) req.auth = { user_id: req.headers['x-test-user'], role: 'superadmin' }; next(); });
    app.use(userAdminAccessControl);
    app.get('/products', requirePermission('products.view'), (req, res) => res.json({ ok: true }));
    app.delete('/products', requirePermission('products.delete'), (req, res) => res.json({ ok: true }));
    app.post('/refund', requirePermission('orders.refund'), (req, res) => res.json({ ok: true }));
    app.use('/role', roleRouter); app.use(errors());
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  }, 30000);
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const as = user => ({ 'x-test-user': String(user._id) });
  it('migrates legacy access idempotently without changing existing assignments', async () => {
    expect((await request(app).get('/products').set(as(staff))).status).toBe(200);
    await migrateRbac(); expect(await Role.countDocuments()).toBe(5);
    expect((await User.findById(owner._id)).admin_role_id).toBeTruthy();
    expect(await Permission.countDocuments()).toBeGreaterThan(100);
  });
  it('always seeds the existing designated owner with the complete database permission catalog', async () => {
    const ownerUser = await User.findById(owner._id);
    await Role.updateOne({ _id: ownerUser.admin_role_id }, { $set: { permissions: [] } });
    await Permission.create({ _id: 'future_module.view', name: 'Future module', module: 'future_module', action: 'view' });
    await ensureOwnerAccess();
    const role = await Role.findById(ownerUser.admin_role_id);
    expect(role.protected).toBe(true);
    expect(role.permissions).toContain('future_module.view');
    expect(role.permissions.length).toBe(await Permission.countDocuments());
    expect((await request(app).get('/products').set(as(owner))).status).toBe(200);
  });
  it('creates a role with arbitrary label and permissions and assigns staff', async () => {
    const created = await request(app).post('/role').set(as(owner)).send({ name: 'Dhaka Warehouse Manager', permissions: ['products.view'] });
    expect(created.status).toBe(200); custom = created.body.data;
    const assigned = await request(app).put(`/role/staff/${staff._id}/role`).set(as(owner)).send({ role_id: custom._id });
    expect(assigned.status).toBe(200);
    expect((await request(app).get('/products').set(as(staff))).status).toBe(200);
    expect((await request(app).delete('/products').set(as(staff))).status).toBe(403);
    expect((await request(app).post('/refund').set(as(staff))).status).toBe(403);
  });
  it('returns 401 for direct unauthenticated API calls', async () => {
    expect((await request(app).get('/products')).status).toBe(401);
  });
  it('updates permission assignment and immediately revokes existing token access', async () => {
    let role = await Role.findById(custom._id);
    const changed = await request(app).put(`/role/${custom._id}`).set(as(owner)).send({ name: role.name, permissions: ['products.view', 'products.delete'], version: role.__v });
    expect(changed.status).toBe(200);
    expect((await request(app).delete('/products').set(as(staff))).status).toBe(200);
    role = await Role.findById(custom._id);
    expect((await request(app).put(`/role/${custom._id}`).set(as(owner)).send({ name: role.name, permissions: [], version: role.__v })).status).toBe(200);
    expect((await request(app).get('/products').set(as(staff))).status).toBe(403);
  });
  it('prevents editing protected roles, self assignment, unknown permissions and client scopes', async () => {
    const role = await Role.findById((await User.findById(owner._id)).admin_role_id);
    expect((await request(app).put(`/role/${role._id}`).set(as(owner)).send({ name: 'Changed', permissions: [], version: role.__v })).status).toBe(403);
    expect((await request(app).put(`/role/staff/${owner._id}/role`).set(as(owner)).send({ role_id: custom._id })).status).toBe(403);
    expect((await request(app).post('/role').set(as(owner)).send({ name: 'Invalid', permissions: ['made_up.manage'] })).status).toBe(403);
    expect((await request(app).post('/role').set(as(owner)).send({ name: 'Foreign', permissions: [], store_id: 'B' })).status).toBe(400);
  });
  it('prevents delegation of stronger roles and requests outside the actor permission set', async () => {
    await Role.updateOne({ _id: custom._id }, { $set: { permissions: ['roles.create', 'roles.update', 'roles.assign', 'staff.view'] } });
    expect((await request(app).post('/role').set(as(staff)).send({ name: 'Elevated', permissions: ['orders.refund'] })).status).toBe(403);
    const manager = await Role.findOne({ key: 'legacy-manager' });
    expect((await request(app).put(`/role/${manager._id}`).set(as(staff)).send({ name: 'Downgrade', permissions: [], version: manager.__v })).status).toBe(403);
  });
  it('supports duplication, staff creation and role activation/deactivation', async () => {
    const copy = await request(app).post(`/role/${custom._id}/duplicate`).set(as(owner)).send({ name: 'Copy' }); expect(copy.status).toBe(200);
    const made = await request(app).post('/role/staff').set(as(owner)).send({ name: 'New Staff', email: 'new@example.com', password: 'long-password-123', role_id: copy.body.data._id }); expect(made.status).toBe(200);
    let role = await Role.findById(copy.body.data._id);
    expect((await request(app).put(`/role/${role._id}`).set(as(owner)).send({ name: role.name, permissions: role.permissions, status: 'inactive', version: role.__v })).status).toBe(200);
    expect((await request(app).get('/role/me').set({ 'x-test-user': made.body.data._id })).status).toBe(403);
    expect((await request(app).delete(`/role/${role._id}`).set(as(owner))).status).toBe(409);
  });
  it('removes assignments without migration restoring access; deletes custom unassigned roles and audits', async () => {
    expect((await request(app).put(`/role/staff/${staff._id}/role`).set(as(owner)).send({ role_id: null })).status).toBe(200);
    await migrateRbac();
    expect((await request(app).get('/role/me').set(as(staff))).status).toBe(403);
    expect((await request(app).delete(`/role/${custom._id}`).set(as(owner))).status).toBe(200);
    expect(await AuditLog.countDocuments({ event: 'RBAC_ROLE_ASSIGNED' })).toBe(2);
    expect(await AuditLog.countDocuments({ event: 'RBAC_ROLE_UPDATED' })).toBeGreaterThan(0);
    expect(JSON.stringify(await AuditLog.find().lean())).not.toContain('long-password');
  });
});
