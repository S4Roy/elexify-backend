import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { addMessage, thread, messageValidation } from './thread.js';
import ContactUs from '../../../models/ContactUs.js';
import Message from '../../../models/ContactUsMessage.js';
import { sendContactReply } from '../../../services/email/sendContactReply.js';
vi.mock('../../../models/ContactUs.js', () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../../../models/ContactUsMessage.js', () => ({ default: {
  init: vi.fn(), findOne: vi.fn(), create: vi.fn(), find: vi.fn(), findByIdAndUpdate: vi.fn(), aggregate: vi.fn(), aggregatePaginate: vi.fn(),
} }));
vi.mock('../../../models/User.js', () => ({ default: { findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ name: 'Agent A' }) }) })) } }));
vi.mock('../../../services/email/sendContactReply.js', () => ({ sendContactReply: vi.fn() }));
const contactId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const requestId = '12345678-1234-4234-8234-123456789012';
let contact, req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  contact = { _id: contactId, name: 'Customer', email: 'customer@example.com', status: 'pending' };
  req = { method: 'POST', params: { id: String(contactId) }, query: { page: 2 }, auth: { user_id: String(userId) },
    body: { request_id: requestId, kind: 'reply', content: 'Here is your answer.' } };
  res = { json: vi.fn(), status: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  next = vi.fn();
  ContactUs.findOne.mockReturnValue({ lean: async () => contact });
  Message.findOne.mockResolvedValue(null);
  Message.create.mockImplementation(async value => ({ _id: new mongoose.Types.ObjectId(), ...value }));
  Message.find.mockReturnValue({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [{ message_id: '<first@example.com>' }] }) }) }) });
  Message.findByIdAndUpdate.mockImplementation(async (_id, update) => ({ _id, ...update.$set }));
  sendContactReply.mockResolvedValue({ accepted: ['customer@example.com'] });
  Message.aggregate.mockReturnValue('aggregation');
  Message.aggregatePaginate.mockResolvedValue({ docs: [], page: 2, totalDocs: 21, totalPages: 2, limit: 20 });
});
describe('contact conversation', () => {
  it('persists a reply before email, links earlier messages, and marks answered only after acceptance', async () => {
    await addMessage(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Message.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reply', author_name: 'Agent A', delivery_status: 'sending', recipient: contact.email }));
    expect(sendContactReply).toHaveBeenCalledWith(contact, expect.objectContaining({ content: req.body.content }), ['<first@example.com>']);
    expect(Message.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), { $set: expect.objectContaining({ delivery_status: 'sent' }) }, { new: true });
    expect(ContactUs.updateOne).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), { $set: expect.objectContaining({ status: 'answered' }) });
  });
  it('keeps remarks private and leaves the workflow status unchanged', async () => {
    req.body.kind = 'note';
    await addMessage(req, res, next);
    expect(sendContactReply).not.toHaveBeenCalled();
    expect(Message.create.mock.calls[0][0]).not.toHaveProperty('recipient');
    expect(ContactUs.updateOne.mock.calls[0][1].$set).not.toHaveProperty('status');
  });
  it('does not resend an idempotent request', async () => {
    Message.findOne.mockResolvedValue({ ...req.body, added_by: userId, delivery_status: 'sent' });
    await addMessage(req, res, next);
    expect(Message.create).not.toHaveBeenCalled();
    expect(sendContactReply).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ delivery_status: 'sent' }) }));
  });
  it('rejects reuse of a request ID with different content', async () => {
    Message.findOne.mockResolvedValue({ ...req.body, content: 'Different reply', added_by: userId });
    await addMessage(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(sendContactReply).not.toHaveBeenCalled();
  });
  it('handles concurrent duplicate insert without sending twice', async () => {
    Message.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...req.body, added_by: userId, delivery_status: 'sending' });
    Message.create.mockRejectedValue({ code: 11000 });
    await addMessage(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(sendContactReply).not.toHaveBeenCalled();
  });
  it.each(['archived', 'spam'])('requires reopening %s enquiries before replying', async status => {
    contact.status = status;
    await addMessage(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(Message.create).not.toHaveBeenCalled();
  });
  it.each([undefined, 'invalid address'])('rejects replies without a valid email (%s)', async email => {
    contact.email = email;
    await addMessage(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(sendContactReply).not.toHaveBeenCalled();
  });
  it.each([[true, 'failed'], [false, 'unknown']])('records mail failure without claiming success (%s)', async (definitelyNotSent, status) => {
    sendContactReply.mockRejectedValue(Object.assign(new Error('SMTP problem'), { definitelyNotSent }));
    await addMessage(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.delivery_status).toBe(status);
    expect(ContactUs.updateOne).not.toHaveBeenCalled();
  });
  it('does not return deleted enquiries', async () => {
    contact = null;
    await thread(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(ContactUs.findOne).toHaveBeenCalledWith({ _id: req.params.id, deleted_at: null });
  });
  it('paginates the conversation with a stable newest-first order', async () => {
    await thread(req, res, next);
    expect(Message.aggregate.mock.calls[0][0][1]).toEqual({ $sort: { created_at: -1, _id: -1 } });
    expect(Message.aggregatePaginate).toHaveBeenCalledWith('aggregation', { page: 2, limit: 20 });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('rejects empty remarks before the controller runs', async () => {
    req.body.content = '   ';
    await messageValidation(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0].details.get('body').details[0].path).toEqual(['content']);
  });
});
