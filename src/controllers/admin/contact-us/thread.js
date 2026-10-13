import mongoose from 'mongoose';
import { Joi, celebrate } from 'celebrate';
import ContactUs from '../../../models/ContactUs.js';
import ContactUsMessage from '../../../models/ContactUsMessage.js';
import User from '../../../models/User.js';
import { StatusError } from '../../../config/StatusErrors.js';
import { sendContactReply } from '../../../services/email/sendContactReply.js';

const id = Joi.string().pattern(/^[a-fA-F0-9]{24}$/).required();
export const threadValidation = celebrate({
  params: Joi.object({ id }),
  query: Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20) }),
});
export const messageValidation = celebrate({
  params: Joi.object({ id }),
  body: Joi.object({
    request_id: Joi.string().guid({ version: 'uuidv4' }).required(),
    kind: Joi.string().valid('reply', 'note').required(),
    content: Joi.string().trim().min(1).max(10000).required(),
  }),
});
export const authorName = async req => {
  const user = await User.findById(req.auth.user_id).select('name').lean();
  return user?.name || 'Support team';
};

export async function thread(req, res, next) {
  try {
    const contact = await ContactUs.findOne({ _id: req.params.id, deleted_at: null }).lean();
    if (!contact) throw StatusError.notFound('Enquiry not found.');
    const messages = await ContactUsMessage.aggregatePaginate(ContactUsMessage.aggregate([
      { $match: { contact_id: new mongoose.Types.ObjectId(req.params.id) } },
      { $sort: { created_at: -1, _id: -1 } },
    ]), { page: req.query.page || 1, limit: req.query.limit || 20 });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { contact, messages } });
  } catch (error) { next(error); }
}

export async function addMessage(req, res, next) {
  try {
    const contact = await ContactUs.findOne({ _id: req.params.id, deleted_at: null }).lean();
    if (!contact) throw StatusError.notFound('Enquiry not found.');
    const { request_id, kind, content } = req.body;
    const existing = await ContactUsMessage.findOne({ contact_id: contact._id, request_id });
    if (existing) {
      if (existing.kind !== kind || existing.content !== content || String(existing.added_by) !== String(req.auth.user_id)) {
        throw StatusError.conflict('This request has already been used for another message.');
      }
      return res.json({ status: 'success', data: existing });
    }
    if (kind === 'reply' && (!contact.email || Joi.string().email().validate(contact.email).error)) {
      throw StatusError.badRequest('A valid customer email address is required to reply.');
    }
    if (kind === 'reply' && ['spam', 'archived'].includes(contact.status)) {
      throw StatusError.conflict('Reopen this enquiry before sending a reply.');
    }
    let message;
    try {
      // Wait for the unique request index before accepting the first write.
      await ContactUsMessage.init();
      message = await ContactUsMessage.create({
        contact_id: contact._id, request_id, kind, content,
        added_by: req.auth.user_id, author_name: await authorName(req),
        ...(kind === 'reply' && {
          recipient: contact.email, delivery_status: 'sending',
          message_id: `<contact-${contact._id}-${request_id}@elexify.online>`,
        }),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const duplicate = await ContactUsMessage.findOne({ contact_id: contact._id, request_id });
      if (!duplicate || duplicate.kind !== kind || duplicate.content !== content || String(duplicate.added_by) !== String(req.auth.user_id)) {
        throw StatusError.conflict('This request has already been used for another message.');
      }
      return res.json({ status: 'success', data: duplicate });
    }
    if (kind === 'reply') {
      const previous = await ContactUsMessage.find({ contact_id: contact._id, kind: 'reply', delivery_status: 'sent' })
        .sort({ created_at: -1, _id: -1 }).limit(20).select('message_id').lean();
      let delivery;
      try { await sendContactReply(contact, message, previous.reverse().map(item => item.message_id)); delivery = 'sent'; }
      catch (error) { delivery = error.definitelyNotSent ? 'failed' : 'unknown'; }
      // A crash after SMTP acceptance leaves "sending" visible; never automatically resend it.
      message = await ContactUsMessage.findByIdAndUpdate(message._id, { $set: {
        delivery_status: delivery, ...(delivery === 'sent' && { sent_at: new Date() }),
      } }, { new: true });
      if (delivery === 'sent') {
        await ContactUs.updateOne({ _id: contact._id, status: contact.status }, { $set: {
          status: 'answered', is_read: true, updated_by: req.auth.user_id,
        } });
      }
    } else {
      await ContactUs.updateOne({ _id: contact._id }, { $set: { updated_by: req.auth.user_id } });
    }
    res.status(201).json({ status: 'success', data: message });
  } catch (error) { next(error); }
}
