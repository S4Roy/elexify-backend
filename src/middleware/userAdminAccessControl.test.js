import { describe, expect, it, vi } from 'vitest';
import { userAdminAccessControl } from './userAdminAccessControl.js';
describe('userAdminAccessControl', () => {
  it('allows an arbitrary active database role label', async () => {
    const next = vi.fn();
    await userAdminAccessControl({ authorization: { role: { name: 'Dhaka Warehouse Manager' }, permissions: new Set() } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
  it('denies an authenticated account without an active assignment', async () => {
    const next = vi.fn();
    await userAdminAccessControl({ authorization: { role: null, permissions: new Set() } }, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
  it('returns 401 without authentication even if a role label is supplied', async () => {
    const next = vi.fn();
    await userAdminAccessControl({ auth: { role: 'superadmin' } }, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
});
