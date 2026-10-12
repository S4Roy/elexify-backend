import { beforeEach, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { getIntegrationConfig } from '../integrationCredentials/index.js';
import { sendContactReply } from './sendContactReply.js';
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
vi.mock('../integrationCredentials/index.js', () => ({ getIntegrationConfig: vi.fn() }));
const sendMail = vi.fn();
const close = vi.fn();
const contact = { _id: '123456789012345678901234', name: '<Customer>', email: 'customer@example.com', subject: 'Order question', notes: [{ content: 'SECRET INTERNAL REMARK' }] };
const message = { content: '<script>alert(1)</script>\nYour answer', message_id: '<reply@elexify.online>' };
beforeEach(() => {
  vi.clearAllMocks();
  getIntegrationConfig.mockResolvedValue({ host: 'smtp.example.com', email: 'sender@example.com', password: 'test', secure: false });
  sendMail.mockResolvedValue({ accepted: [contact.email] });
  nodemailer.createTransport.mockReturnValue({ sendMail, close });
});
it('escapes reply text, excludes private notes, and sets standard threading headers', async () => {
  await sendContactReply(contact, message, ['<first@elexify.online>', '<last@elexify.online>']);
  const mail = sendMail.mock.calls[0][0];
  expect(mail.to).toEqual({ name: contact.name, address: contact.email });
  expect(mail.messageId).toBe(message.message_id);
  expect(mail.inReplyTo).toBe('<last@elexify.online>');
  expect(mail.references).toEqual(['<first@elexify.online>', '<last@elexify.online>']);
  expect(mail.replyTo).toBe('support@elexify.online');
  expect(mail.html).toContain('&lt;script&gt;');
  expect(mail.html).not.toContain('<script>');
  expect(mail.html + mail.text).not.toContain('SECRET INTERNAL REMARK');
  expect(close).toHaveBeenCalled();
});
it('does not send when SMTP is disabled', async () => {
  getIntegrationConfig.mockResolvedValue(null);
  await expect(sendContactReply(contact, message)).rejects.toMatchObject({ definitelyNotSent: true });
  expect(sendMail).not.toHaveBeenCalled();
});
it('does not claim delivery when the recipient was rejected', async () => {
  sendMail.mockResolvedValue({ accepted: [] });
  await expect(sendContactReply(contact, message)).rejects.toMatchObject({ definitelyNotSent: true });
  expect(close).toHaveBeenCalled();
});
