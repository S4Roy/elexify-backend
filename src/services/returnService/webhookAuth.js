import { timingSafeEqual } from 'node:crypto';
export const validReturnWebhookToken = (token, secret = process.env.RETURN_WEBHOOK_TOKEN) => {
  if (!secret || typeof token !== 'string') return false;
  const a = Buffer.from(token); const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};
