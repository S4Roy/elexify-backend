import { beforeEach, expect, it, vi } from 'vitest';
import { edit } from './edit.js';
import { edit as validation } from '../../../validations/admin/contact-us/edit.js';
import ContactUs from '../../../models/ContactUs.js';
vi.mock('../../../models/ContactUs.js', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('./thread.js', () => ({ authorName: vi.fn(async () => 'Agent A') }));
vi.mock('../../../config/index.js', async () => ({ StatusError: (await import('../../../config/StatusErrors.js')).StatusError }));
let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  req = { method: 'PUT', body: { _id: '123456789012345678901234', status: 'pending', priority: 'urgent' }, auth: { user_id: '123456789012345678901235' }, __: value => value };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
  ContactUs.findOne.mockResolvedValue({ status: 'archived', priority: 'normal', updated_at: new Date('2026-10-12') });
  ContactUs.findOneAndUpdate.mockResolvedValue({ status: 'pending', priority: 'urgent' });
});
it('allows reopening an enquiry with pending status', async () => {
  await validation(req, res, next);
  expect(next).toHaveBeenCalledWith(null);
});
it('records workflow changes atomically with actor and timestamp', async () => {
  await edit(req, res, next);
  expect(next).not.toHaveBeenCalled();
  const [filter, update] = ContactUs.findOneAndUpdate.mock.calls[0];
  expect(filter).toMatchObject({ deleted_at: null, status: 'archived' });
  expect(update.$set).toMatchObject({ status: 'pending', priority: 'urgent', updated_by: req.auth.user_id });
  expect(update.$push.notes).toMatchObject({ kind: 'activity', author_name: 'Agent A', added_by: req.auth.user_id });
  expect(update.$push.notes.content).toContain('Status changed from archived to pending');
  expect(update.$push.notes.content).toContain('Priority changed from normal to urgent');
});
it('rejects a concurrent workflow change instead of overwriting it', async () => {
  ContactUs.findOneAndUpdate.mockResolvedValue(null);
  await edit(req, res, next);
  expect(next.mock.calls[0][0].statusCode).toBe(409);
});
it('does not update a deleted enquiry', async () => {
  ContactUs.findOne.mockResolvedValue(null);
  await edit(req, res, next);
  expect(next.mock.calls[0][0].statusCode).toBe(404);
  expect(ContactUs.findOneAndUpdate).not.toHaveBeenCalled();
});
