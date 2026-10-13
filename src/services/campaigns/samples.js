import Handlebars from 'handlebars';
import Campaign from '../../models/EmailCampaign.js';
import { emailBrand } from '../../config/emailBrand.js';
import { cleanBody } from './content.js';

export const SAMPLE_CAMPAIGN_KEYS = ['welcome', 'new-arrivals', 'seasonal-edit', 'product-discovery', 'weekend-browse'];
export function sampleCampaigns() {
  const brand = Handlebars.escapeExpression(emailBrand.brandName);
  let storefront = 'https://elexify.online/';
  try {
    const url = new URL(emailBrand.storefrontUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) storefront = url.href;
  } catch { /* Use the public storefront when the environment has no URL. */ }
  const link = Handlebars.escapeExpression(storefront);
  const closing = `<p>Need a hand choosing? Reply to this email and our team will be happy to help.</p><p>Happy browsing,<br>The ${brand} team</p>`;
  const definitions = [
    {
      key: 'welcome', name: 'Sample · Welcome to Elexify', subject: `Welcome to ${emailBrand.brandName}`, preheader: 'Your next discovery starts here.',
      body: `<h2>Welcome to ${brand}</h2><p>Thanks for joining our newsletter. We’re glad you’re here.</p><p>Look out for collection updates, shopping inspiration, and news from our store.</p><p>Take a look around and discover something that fits your everyday life.</p><p><a href="${link}">Explore the store</a></p>${closing}`,
    },
    {
      key: 'new-arrivals', name: 'Sample · New collection announcement', subject: 'Make room for your next discovery', preheader: 'Explore the latest collection from our store.',
      body: `<h2>A fresh collection to explore</h2><p>Looking for something new? Start with a browse through our collection and find an item that feels right for you.</p><ul><li>Discover products for your everyday needs.</li><li>Compare the details that matter to you.</li><li>Save your favourites for later.</li></ul><p><a href="${link}">Discover the collection</a></p>${closing}`,
    },
    {
      key: 'seasonal-edit', name: 'Sample · Seasonal shopping inspiration', subject: 'A little inspiration for the season ahead', preheader: 'Find thoughtful picks for your next shopping list.',
      body: `<h2>Refresh your shopping list</h2><p>A new season is a good moment to think about what you need, what you love, and what makes a thoughtful gift.</p><p>Explore our store for ideas, whether you’re shopping for yourself or someone special.</p><p><a href="${link}">Find your next favourite</a></p>${closing}`,
    },
    {
      key: 'product-discovery', name: 'Sample · Product discovery guide', subject: 'Find the right fit for your everyday needs', preheader: 'A simple guide to choosing your next purchase.',
      body: `<h2>Shop with confidence</h2><p>Choosing something new? A few small checks can make the decision easier.</p><ol><li>Start with how you’ll use it.</li><li>Read the product details and compare your options.</li><li>Check availability and delivery information before checkout.</li></ol><p>Our team is here if you have questions along the way.</p><p><a href="${link}">Browse your options</a></p>${closing}`,
    },
    {
      key: 'weekend-browse', name: 'Sample · Weekend store newsletter', subject: 'Take a moment to find something you’ll love', preheader: 'Your weekend browsing starts here.',
      body: `<h2>Your next favourite could be waiting</h2><p>Make a little time to explore. Browse the collection, revisit your favourites, and find something that suits your style.</p><p>No rush—take a closer look at the details and choose what works for you.</p><p><a href="${link}">Start browsing</a></p>${closing}`,
    },
  ];
  return definitions.map(({ key, ...data }) => ({ ...data, sample_key: key, body: cleanBody(data.body), source: 'all', status: 'draft', revision: 1 }));
}

export async function seedSampleCampaigns({ dryRun = false } = {}) {
  const samples = sampleCampaigns();
  const existing = await Campaign.find({ sample_key: { $in: SAMPLE_CAMPAIGN_KEYS } }).select('sample_key').lean();
  const present = new Set(existing.map(campaign => campaign.sample_key));
  if (dryRun) return { wouldInsert: samples.filter(sample => !present.has(sample.sample_key)).length, wouldUpdate: 0, wouldSkip: present.size, wouldDelete: 0 };
  await Campaign.createIndexes();
  let inserted = 0;
  for (const sample of samples) {
    const now = new Date();
    try {
      const result = await Campaign.updateOne({ sample_key: sample.sample_key },
        { $setOnInsert: { ...sample, created_at: now, updated_at: now } },
        { upsert: true, runValidators: true, timestamps: false });
      inserted += result.upsertedCount || 0;
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.sample_key) throw error;
    }
  }
  return { inserted, updated: 0, skipped: samples.length - inserted, deleted: 0 };
}
