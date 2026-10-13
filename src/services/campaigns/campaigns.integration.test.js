import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { errors } from 'celebrate';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('../../middleware/requirePermission.js', () => ({ requirePermission: (...keys) => (req, res, next) => keys.every(key => req.testPermissions.has(key)) ? next() : res.status(403).json({ message: 'Forbidden' }) }));
vi.mock('./delivery.js', async importOriginal => ({ ...(await importOriginal()), campaignPreflight: vi.fn(async () => ({})), unsubscribeBase: () => 'https://example.com/api/v1/newsletter/unsubscribe/', deliverCampaign: vi.fn(async () => ({ accepted: ['person@example.com'], messageId: 'message-1' })) }));
import Campaign from '../../models/EmailCampaign.js';
import Recipient from '../../models/EmailCampaignRecipient.js';
import Subscriber from '../../models/Subscriber.js';
import { emailCampaignsRouter } from '../../routes/admin/emailCampaigns.js';
import { newsletterUnsubscribeRouter } from '../../routes/site/newsletterUnsubscribe.js';
import { processEmailCampaigns, ensureCampaignIndexes } from './worker.js';
import { deliverCampaign } from './delivery.js';
const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, '/elexify_campaign_integration$1');
const suite = uri ? describe : describe.skip;
const actor = new mongoose.Types.ObjectId();
const permissions = ['subscribers.view', ...['view', 'create', 'send', 'schedule', 'cancel'].map(action => `customer.notification.${action}`)];
const data = { name: 'Launch', subject: 'New arrivals', preheader: 'Explore', body: '<h2>Discover</h2><p>Our collection</p>', source: 'all' };
let app;
const draft = () => Campaign.create({ ...data, created_by: actor });
const queue = async campaign => {
  const prepared = await request(app).post(`/campaigns/${campaign._id}/prepare`).send({});
  expect(prepared.status).toBe(200);
  const result = await request(app).post(`/campaigns/${campaign._id}/queue`).send({ token: prepared.body.data.token, revision: prepared.body.data.revision });
  expect(result.status).toBe(200);
  return prepared.body.data;
};
suite('email campaign lifecycle (isolated MongoDB, mocked SMTP)', () => {
  beforeAll(async () => {
    await mongoose.connect(uri);
    await ensureCampaignIndexes();
    app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => { req.auth = { user_id: actor }; req.testPermissions = new Set(req.headers['x-no-send'] ? permissions.filter(key => key !== 'customer.notification.send') : permissions); next(); });
    app.use('/campaigns', emailCampaignsRouter); app.use('/unsubscribe', newsletterUnsubscribeRouter);
    app.use(errors()); app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  });
  beforeEach(async () => { await Promise.all([Campaign.deleteMany({}), Recipient.deleteMany({}), Subscriber.deleteMany({})]); vi.clearAllMocks(); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  it('queues once, excludes legacy/opt-out/deleted contacts, and never resends completed recipients', async () => {
    await Subscriber.create([{ email: 'eligible@example.com', status: 'subscribed' }, { email: 'legacy@example.com', status: 'pending' }, { email: 'out@example.com', status: 'unsubscribed' }, { email: 'suppressed@example.com', status: 'suppressed' }, { email: 'deleted@example.com', status: 'subscribed', deleted_at: new Date() }]);
    const campaign = await draft(); const confirmation = await queue(campaign);
    const duplicate = await request(app).post(`/campaigns/${campaign._id}/queue`).send({ token: confirmation.token, revision: confirmation.revision });
    expect(duplicate.status).toBe(409);
    await Promise.all([processEmailCampaigns(), processEmailCampaigns()]); await processEmailCampaigns(); await processEmailCampaigns();
    expect(deliverCampaign).toHaveBeenCalledTimes(1);
    expect(deliverCampaign.mock.calls[0][1]).toBe('eligible@example.com');
    expect(deliverCampaign.mock.calls[0][2]).toMatch(/unsubscribe\/[a-f0-9]{64}$/);
    expect((await Campaign.findById(campaign._id)).status).toBe('completed');
    expect(await Recipient.countDocuments({ status: 'accepted' })).toBe(1);
  });
  it('invalidates preview confirmation after a draft edit and enforces send permission', async () => {
    await Subscriber.create({ email: 'eligible@example.com' }); const campaign = await draft();
    const prepared = await request(app).post(`/campaigns/${campaign._id}/prepare`).send({});
    expect((await request(app).put(`/campaigns/${campaign._id}`).send({ ...data, subject: 'Changed', revision: 1 })).status).toBe(200);
    expect((await request(app).post(`/campaigns/${campaign._id}/queue`).send({ token: prepared.body.data.token, revision: 1 })).status).toBe(409);
    expect((await request(app).post(`/campaigns/${campaign._id}/prepare`).set('x-no-send', '1').send({})).status).toBe(403);
  });
  it('does not send early and stops work when cancelled', async () => {
    await Subscriber.create({ email: 'eligible@example.com' }); const campaign = await draft(); await queue(campaign);
    await Campaign.updateOne({ _id: campaign._id }, { $set: { scheduled_at: new Date(Date.now() + 60000) } });
    await processEmailCampaigns(); expect(deliverCampaign).not.toHaveBeenCalled();
    expect((await request(app).post(`/campaigns/${campaign._id}/cancel`).send({})).status).toBe(200);
    await processEmailCampaigns(); expect(deliverCampaign).not.toHaveBeenCalled();
  });
  it('rechecks eligibility for queued recipients after an unsubscribe', async () => {
    const contact = await Subscriber.create({ email: 'eligible@example.com' }); const campaign = await draft(); await queue(campaign);
    await Recipient.create({ campaign_id: campaign._id, subscriber_id: contact._id, email: contact.email });
    await Subscriber.updateOne({ _id: contact._id }, { $set: { status: 'unsubscribed' } });
    await processEmailCampaigns();
    expect(deliverCampaign).not.toHaveBeenCalled(); expect((await Recipient.findOne()).status).toBe('skipped');
  });
  it('excludes contacts added after queuing and filters by source', async () => {
    await Subscriber.create([{ email: 'web@example.com', source: 'web' }, { email: 'mobile@example.com', source: 'mobile' }]);
    const campaign = await Campaign.create({ ...data, source: 'mobile' }); await queue(campaign);
    await Subscriber.create({ email: 'late@example.com', source: 'mobile', created_at: new Date(Date.now() + 1000) });
    await processEmailCampaigns(); await processEmailCampaigns();
    expect(deliverCampaign).toHaveBeenCalledTimes(1); expect(deliverCampaign.mock.calls[0][1]).toBe('mobile@example.com');
  });
  it('recovers stale SMTP claims as unknown and never resends them', async () => {
    const contact = await Subscriber.create({ email: 'eligible@example.com' }); const campaign = await draft(); await queue(campaign);
    await Recipient.create({ campaign_id: campaign._id, subscriber_id: contact._id, email: contact.email, status: 'sending', claimed_at: new Date(Date.now() - 20 * 60000) });
    await processEmailCampaigns(); await processEmailCampaigns();
    expect(deliverCampaign).not.toHaveBeenCalled(); expect((await Recipient.findOne()).status).toBe('unknown');
  });
  it('stops additional recipients when cancellation arrives during a send', async () => {
    await Subscriber.create([{ email: 'first@example.com' }, { email: 'second@example.com' }]);
    const campaign = await draft(); await queue(campaign);
    deliverCampaign.mockImplementationOnce(async () => {
      await request(app).post(`/campaigns/${campaign._id}/cancel`).send({});
      return { accepted: ['first@example.com'], messageId: 'in-flight' };
    });
    await processEmailCampaigns();
    expect(deliverCampaign).toHaveBeenCalledTimes(1);
    expect(await Recipient.countDocuments({ status: 'accepted' })).toBe(1);
    expect(await Recipient.countDocuments({ status: 'skipped' })).toBe(1);
  });
  it('suppresses a permanently rejected address and preserves an explicit failed result', async () => {
    const contact = await Subscriber.create({ email: 'bounce@example.com' }); const campaign = await draft(); await queue(campaign);
    deliverCampaign.mockRejectedValueOnce({ code: 'EENVELOPE', responseCode: 550 });
    await processEmailCampaigns(); await processEmailCampaigns();
    expect((await Subscriber.findById(contact._id)).status).toBe('suppressed');
    expect((await Recipient.findOne()).status).toBe('failed');
    expect(deliverCampaign).toHaveBeenCalledTimes(1);
  });
  it('rejects an expired confirmation and a conflicting draft revision', async () => {
    await Subscriber.create({ email: 'eligible@example.com' }); const campaign = await draft();
    const prepared = await request(app).post(`/campaigns/${campaign._id}/prepare`).send({});
    await Campaign.updateOne({ _id: campaign._id }, { $set: { confirmation_expires: new Date(Date.now() - 1000) } });
    expect((await request(app).post(`/campaigns/${campaign._id}/queue`).send({ token: prepared.body.data.token, revision: 1 })).status).toBe(409);
    expect((await request(app).put(`/campaigns/${campaign._id}`).send({ ...data, revision: 2 })).status).toBe(409);
    expect(deliverCampaign).not.toHaveBeenCalled();
  });
  it('does not mutate on GET and handles anonymous one-click POST idempotently', async () => {
    const token = 'a'.repeat(64); const contact = await Subscriber.create({ email: 'eligible@example.com', unsubscribe_token: token });
    expect((await request(app).get(`/unsubscribe/${token}`)).status).toBe(200);
    expect((await Subscriber.findById(contact._id)).status).toBe('subscribed');
    expect((await request(app).post(`/unsubscribe/${token}`).type('form').send({ 'List-Unsubscribe': 'One-Click' })).status).toBe(200);
    expect((await Subscriber.findById(contact._id)).status).toBe('unsubscribed');
    expect((await request(app).post(`/unsubscribe/${token}`).send({})).status).toBe(200);
    expect((await request(app).post(`/unsubscribe/${'b'.repeat(64)}`).send({})).status).toBe(200);
  });
});
