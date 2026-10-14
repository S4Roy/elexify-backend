import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../models/User.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../../services/customerSession/index.js', () => ({ revokeAll: vi.fn() }));
vi.mock('../../../helpers/index.js', () => ({ generalHelper: {} }));
vi.mock('../../../services/index.js', () => ({ notificationService: {} }));
vi.mock('../../../config/index.js', () => ({ StatusError: { badRequest: message => new Error(message) } }));
import User from '../../../models/User.js';
import { edit } from './edit.js';

const update = async (name, body) => {
  const user = { name, save: vi.fn() };
  User.findOne.mockResolvedValue(user);
  const next = vi.fn();
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await edit({ body, auth: { user_id: 'customer-id' }, __: text => text }, res, next);
  return { user, next, res };
};
describe('customer name correction', () => {
  beforeEach(() => vi.clearAllMocks());
  it('clears an invalid existing last name when the customer submits an empty last name', async () => {
    const { user, next } = await update('Asha রায়', { last_name: '' });
    expect(user.name).toBe('Asha');
    expect(user.save).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
  it('rejects a partial update that leaves the combined name invalid', async () => {
    const { user, next } = await update('রাহুল Roy', { last_name: 'Smith' });
    expect(user.save).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
  it('allows unrelated updates so legacy accounts can still manage their account', async () => {
    const { user, next } = await update('রাহুল Roy', { gender: 'male' });
    expect(user.name).toBe('রাহুল Roy');
    expect(user.save).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
