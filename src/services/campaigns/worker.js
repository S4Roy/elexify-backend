import { randomBytes, randomUUID } from 'node:crypto';
import Campaign from '../../models/EmailCampaign.js';
import Recipient from '../../models/EmailCampaignRecipient.js';
import Subscriber from '../../models/Subscriber.js';
import { audienceFilter } from './content.js';
import { deliverCampaign, failureStatus, unsubscribeBase, campaignPreflight } from './delivery.js';
let running = false;
let indexPromise;
export async function ensureCampaignIndexes() {
  indexPromise ||= Promise.all([Campaign.createIndexes(), Recipient.createIndexes(), Subscriber.createIndexes()]).catch(error => { indexPromise = null; throw error; });
  await indexPromise;
}
export async function processEmailCampaigns(batch = 10) {
  if (running) return;
  running = true;
  let campaign;
  const token = randomUUID();
  try {
    await ensureCampaignIndexes();
    await Recipient.updateMany({ status: 'sending', claimed_at: { $lt: new Date(Date.now() - 15 * 60000) } },
      { $set: { status: 'unknown', error: 'Worker interrupted; SMTP acceptance is unconfirmed. Not retried.' } });
    const now = new Date();
    campaign = await Campaign.findOneAndUpdate({ status: { $in: ['queued', 'sending'] }, scheduled_at: { $lte: now },
      $or: [{ lock_until: null }, { lock_until: { $lte: now } }] },
    { $set: { status: 'sending', lock_token: token, lock_until: new Date(Date.now() + 15 * 60000) } }, { new: true, sort: { scheduled_at: 1 } });
    if (!campaign) return;
    // Fail closed when the provider or sender identity is unavailable, leaving pending work intact.
    await campaignPreflight();
    await Recipient.updateMany({ campaign_id: campaign._id, status: 'sending', claimed_at: { $lt: new Date(Date.now() - 15 * 60000) } },
      { $set: { status: 'unknown', error: 'Worker interrupted; SMTP acceptance is unconfirmed. Not retried.' } });
    if (!campaign.exhausted) {
      const contacts = await Subscriber.find(audienceFilter(campaign, campaign.cursor)).sort({ _id: 1 }).limit(batch).lean();
      if (contacts.length) {
        await Recipient.bulkWrite(contacts.map(contact => ({ updateOne: { filter: { campaign_id: campaign._id, subscriber_id: contact._id },
          update: { $setOnInsert: { campaign_id: campaign._id, subscriber_id: contact._id, email: contact.email, status: 'pending' } }, upsert: true } })), { ordered: false });
        await Campaign.updateOne({ _id: campaign._id, lock_token: token }, { $set: { cursor: contacts.at(-1)._id } });
      } else {
        campaign.exhausted = true;
        await Campaign.updateOne({ _id: campaign._id, lock_token: token }, { $set: { exhausted: true } });
      }
    }
    for (let i = 0; i < batch; i++) {
      const held = await Campaign.findOneAndUpdate({ _id: campaign._id, status: 'sending', lock_token: token },
        { $set: { lock_until: new Date(Date.now() + 15 * 60000) } }, { new: true });
      if (!held) break;
      const job = await Recipient.findOneAndUpdate({ campaign_id: campaign._id, status: 'pending' },
        { $set: { status: 'sending', claimed_at: new Date() } }, { new: true, sort: { _id: 1 } });
      if (!job) break;
      try {
        let contact = await Subscriber.findOne({ _id: job.subscriber_id, email: job.email, ...audienceFilter(campaign) }).select('+unsubscribe_token');
        if (!contact) { await Recipient.updateOne({ _id: job._id }, { $set: { status: 'skipped', error: 'No longer eligible for marketing.' } }); continue; }
        if (!contact.unsubscribe_token) {
          await Subscriber.updateOne({ _id: contact._id, unsubscribe_token: null }, { $set: { unsubscribe_token: randomBytes(32).toString('hex') } });
          contact = await Subscriber.findById(contact._id).select('+unsubscribe_token');
        }
        if (!contact?.unsubscribe_token) {
          await Recipient.updateOne({ _id: job._id }, { $set: { status: 'skipped', error: 'Contact removed before send.' } }); continue;
        }
        // Recheck both cancellation and opt-out immediately before contacting SMTP.
        if (!await Campaign.exists({ _id: campaign._id, status: 'sending', lock_token: token }) ||
            !await Subscriber.exists({ _id: contact._id, email: job.email, ...audienceFilter(campaign) })) {
          await Recipient.updateOne({ _id: job._id }, { $set: { status: 'skipped', error: 'Cancelled or opted out before send.' } }); continue;
        }
        const info = await deliverCampaign(campaign, contact.email, unsubscribeBase() + contact.unsubscribe_token);
        await Recipient.updateOne({ _id: job._id, status: 'sending' }, { $set: { status: 'accepted', message_id: info.messageId, sent_at: new Date() } });
      } catch (error) {
        await Recipient.updateOne({ _id: job._id, status: 'sending' }, { $set: { status: failureStatus(error), error: 'SMTP send failed or could not be confirmed.' } });
        if ([550, 551, 553].includes(Number(error.responseCode)) && error.code === 'EENVELOPE') {
          await Subscriber.updateOne({ _id: job.subscriber_id, status: 'subscribed', deleted_at: null }, { $set: { status: 'suppressed' } });
        }
      }
    }
    if (campaign.exhausted && !await Recipient.exists({ campaign_id: campaign._id, status: { $in: ['pending', 'sending'] } })) {
      await Campaign.updateOne({ _id: campaign._id, status: 'sending', lock_token: token }, { $set: { status: 'completed', completed_at: new Date() } });
    }
  } finally {
    try {
      if (campaign && await Campaign.exists({ _id: campaign._id, status: 'cancelled' })) {
        await Recipient.updateMany({ campaign_id: campaign._id, status: 'pending' }, { $set: { status: 'skipped', error: 'Campaign cancelled.' } });
      }
      if (campaign) await Campaign.updateOne({ _id: campaign._id, lock_token: token }, { $unset: { lock_token: '', lock_until: '' } });
    } finally { running = false; }
  }
}
