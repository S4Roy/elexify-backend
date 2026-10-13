import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
vi.mock('../../models/Subscriber.js', () => ({ default: { updateOne: vi.fn() } }));
import Subscriber from '../../models/Subscriber.js';
import { newsletterUnsubscribeRouter } from './newsletterUnsubscribe.js';
import { buildCorsOptions } from '../../config/corsOptions.js';
const token = 'a'.repeat(64);
function app() {
  const server = express();
  server.use('/unsubscribe', newsletterUnsubscribeRouter);
  server.use(cors(buildCorsOptions(['https://elexify.online'])));
  server.get('/private-api', (req, res) => res.json({ ok: true }));
  server.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  return server;
}
describe('public unsubscribe CORS boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('allows an opaque-origin form POST and updates only the token-matched subscription', async () => {
    const res = await request(app()).post(`/unsubscribe/${token}`).set('Origin', 'null').type('form').send({ 'List-Unsubscribe': 'One-Click' });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(Subscriber.updateOne).toHaveBeenCalledWith({ unsubscribe_token: token, status: 'subscribed' }, expect.objectContaining({ $set: expect.objectContaining({ status: 'unsubscribed' }) }));
  });
  it('allows provider-origin preflight without touching subscriber state', async () => {
    const res = await request(app()).options(`/unsubscribe/${token}`).set('Origin', 'https://mail.example.com').set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204); expect(Subscriber.updateOne).not.toHaveBeenCalled();
  });
  it('renders GET confirmation without unsubscribing and still blocks null on normal APIs', async () => {
    expect((await request(app()).get(`/unsubscribe/${token}`).set('Origin', 'null')).status).toBe(200);
    expect(Subscriber.updateOne).not.toHaveBeenCalled();
    expect((await request(app()).get('/private-api').set('Origin', 'null')).status).toBe(403);
  });
});
