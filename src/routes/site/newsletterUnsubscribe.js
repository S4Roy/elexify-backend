import cors from 'cors';
import { Router } from 'express';
import { celebrate, Joi } from 'celebrate';
import rateLimit from 'express-rate-limit';
import Subscriber from '../../models/Subscriber.js';
const router = Router();
// No cookies or session: possession of the random token authorizes opt-out.
// Permit opaque origins and mailbox providers without opening normal APIs.
router.use(cors({ origin: '*', credentials: false, methods: ['GET', 'POST'] }));
router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false }));
const validate = celebrate({ params: Joi.object({ token: Joi.string().hex().length(64).required() }) });
// No API key/session/reCAPTCHA required: mailbox one-click POSTs have none.
// GET never mutates, so email scanners cannot unsubscribe people automatically.
router.get('/:token', validate, (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter preferences</title><body style="font:16px system-ui;max-width:520px;margin:80px auto;padding:24px"><h1>Unsubscribe from newsletters</h1><p>You will stop receiving promotional newsletter emails. Order and account messages will continue.</p><form method="post"><button type="submit" style="padding:12px 20px">Unsubscribe</button></form></body></html>`);
});
router.post('/:token', validate, async (req, res, next) => {
  try {
    await Subscriber.updateOne({ unsubscribe_token: req.params.token, status: 'subscribed' },
      { $set: { status: 'unsubscribed', unsubscribed_at: new Date(), updated_by: null } });
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter preferences updated</title><body style="font:16px system-ui;max-width:520px;margin:80px auto;padding:24px"><h1>Preferences updated</h1><p>This newsletter unsubscribe request has been processed.</p></body></html>');
  } catch (error) { next(error); }
});
export { router as newsletterUnsubscribeRouter };
