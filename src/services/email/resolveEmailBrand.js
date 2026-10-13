import SiteSetting from '../../models/SiteSetting.js';
import mongoose from 'mongoose';
import { emailBrand } from '../../config/emailBrand.js';
import { websiteAppLinks, validStoreUrl } from '../mobileUpdatePolicy.js';
let cached;
let expires = 0;
let pending;
// Reuse the same public app visibility and validated URLs as the storefront.
// Cache only link settings; SMTP credentials still resolve independently per send.
export async function resolveEmailBrand() {
  if (mongoose.connection.readyState !== 1) return emailBrand;
  if (cached && Date.now() < expires) return cached;
  pending ||= Promise.all([
    websiteAppLinks(),
    SiteSetting.find({ slug: { $in: ['social_instagram_url', 'social_facebook_url', 'social_youtube_url', 'social_twitter_url', 'social_telegram_url'] } }).select('slug value').lean(),
  ]).then(([links, settings]) => {
    const labels = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', twitter: 'X (Twitter)', telegram: 'Telegram' };
    const socialLinks = settings.flatMap(setting => {
      const key = setting.slug.replace('social_', '').replace('_url', '');
      try {
        const url = new URL(setting.value);
        if (url.protocol !== 'https:' || url.username || url.password || !labels[key]) return [];
        return [{ url: url.href, label: labels[key], iconUrl: `${emailBrand.storefrontUrl}/email/${key}.png` }];
      } catch { return []; }
    });
    cached = { ...emailBrand, socialLinks,
      androidAppUrl: validStoreUrl('android', links.android) ? links.android : '',
      iosAppUrl: validStoreUrl('ios', links.ios) ? links.ios : '',
    };
    expires = Date.now() + 60000;
    return cached;
  }).catch(() => {
    cached = emailBrand;
    expires = Date.now() + 5000;
    return cached;
  }).finally(() => { pending = null; });
  return pending;
}
