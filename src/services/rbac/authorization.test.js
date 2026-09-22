import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/User.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../models/Role.js', () => ({ default: { findOne: vi.fn() } }));
import User from '../../models/User.js';
import Role from '../../models/Role.js';
import { resolveAuthorization, assertDelegable } from './authorization.js';
import { requirePermission } from '../../middleware/requirePermission.js';
const query = value => ({ select: () => ({ lean: async () => value }), lean: async () => value });
beforeEach(() => { vi.clearAllMocks(); User.findOne.mockReturnValue(query({ _id: 'user', admin_role_id: 'role' })); Role.findOne.mockReturnValue(query({ _id: 'role', name: 'Arbitrary', permissions: ['products.create'] })); });
describe('database authorization', () => {
  it('allows assigned permissions and denies missing ones with 403', async () => {
    const req = { auth: { user_id: 'user', role: 'customer' } }; const next = vi.fn();
    await requirePermission('products.create')(req, {}, next); expect(next).toHaveBeenCalledWith();
    await requirePermission('products.delete')(req, {}, next); expect(next.mock.calls[1][0].statusCode).toBe(403);
    expect(User.findOne).toHaveBeenCalledTimes(1); expect(Role.findOne).toHaveBeenCalledTimes(1);
  });
  it('returns 401 without authentication', async () => {
    const next = vi.fn(); await requirePermission('products.create')({}, {}, next); expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
  it('does not cache permissions across requests or trust token role names', async () => {
    const auth = { user_id: 'user', role: 'superadmin' };
    expect((await resolveAuthorization({ auth })).permissions.has('products.create')).toBe(true);
    Role.findOne.mockReturnValue(query(null));
    expect((await resolveAuthorization({ auth })).permissions.size).toBe(0);
    expect(Role.findOne).toHaveBeenLastCalledWith({ _id: 'role', status: 'active', deleted_at: null });
  });
  it('does not resolve assignments from body, query or foreign scope claims', async () => {
    await resolveAuthorization({ auth: { user_id: 'user' }, body: { user_id: 'victim', admin_role_id: 'owner', tenant_id: 'other' }, query: { store_id: 'other' } });
    expect(User.findOne).toHaveBeenCalledWith({ _id: 'user', status: 'active', deleted_at: null });
    expect(Role.findOne).toHaveBeenCalledWith({ _id: 'role', status: 'active', deleted_at: null });
  });
  it('rejects blocked or deleted users even with a valid token', async () => {
    User.findOne.mockReturnValue(query(null)); await expect(resolveAuthorization({ auth: { user_id: 'user' } })).rejects.toMatchObject({ statusCode: 401 });
  });
  it('prevents privilege escalation and protects the existing owner', () => {
    const context = { permissions: new Set(['products.view']) };
    expect(() => assertDelegable(context, { permissions: ['products.delete'] })).toThrow();
    expect(() => assertDelegable(context, { protected: true, permissions: [] })).toThrow();
    expect(() => assertDelegable(context, { permissions: ['products.view'] })).not.toThrow();
  });
});
