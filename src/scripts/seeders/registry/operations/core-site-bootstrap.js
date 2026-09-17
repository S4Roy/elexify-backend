// Absorbs the site-settings/pages/navigation-menu half of the legacy,
// UNAUTHENTICATED `GET ${basePath}/debug/db-seeding` route
// (controllers/DbSeedingController.js, removed from server.js as part of
// this migration). The superadmin-creation block from that controller is
// intentionally NOT ported here — creating a privileged account is
// UNSAFE_FOR_ADMIN execution and stays as the standalone
// `npm run seed:production`-style CLI-only flow (scripts/seedProduction.js),
// never reachable from this registry. The Order.total_items backfill half
// is ported separately as order-total-items-backfill.js.
//
// Fully idempotent: every write below uses $setOnInsert (site settings,
// pages) or upsert-if-absent (navigation menus/items) — never overwrites a
// value an admin has since edited, matching the plan's explicit
// requirement to fix this controller's occasional non-idempotent patterns
// on the way in.
import SiteSetting from "../../../../models/SiteSetting.js";
import NavigationMenu from "../../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../../models/NavigationMenuItem.js";
import Page from "../../../../models/Page.js";
import { navigationService } from "../../../../services/index.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const SETTINGS = [
  { slug: "site_title", value: "Elexify Industries", label: "Site Title", type: "site_info" },
  { slug: "site_tagline", value: "Your Trusted Source for Electronic Components", label: "Site Tagline", type: "site_info" },
  { slug: "contact_mobile", value: "+91 9110976419", label: "Contact Mobile", type: "contact_info" },
  { slug: "contact_mobile_2", value: "8906787168", label: "Contact Mobile 2", type: "contact_info" },
  { slug: "contact_email", value: "support@elexify.online", label: "Contact Email", type: "contact_info" },
  { slug: "contact_address", value: "57, T.N. Banerjee Road, Panihati, Kolkata - 700114, West Bengal, India", label: "Contact Address", type: "contact_info" },
  { slug: "whatsapp_number", value: "919064401121", label: "WhatsApp Number (digits only, with country code)", type: "contact_info" },
  // From the verified Google Maps place (Elexify Industries Pvt. Ltd.) —
  // pins the Contact Us page map exactly instead of geocoding the address
  // text, which can drift onto a nearby street.
  { slug: "company_lat", value: "22.6922229", label: "Map Latitude", type: "contact_info" },
  { slug: "company_lng", value: "88.3671835", label: "Map Longitude", type: "contact_info" },
  // The exact <iframe src> from Google Maps' own "Share > Embed a map"
  // dialog for this place ID — preferred over the lat/lng query above
  // since it's the URL Google itself generates for this exact listing
  // (correct zoom/tilt, pin label, place card) rather than an approximation
  // built from bare coordinates. To update (e.g. after a move), open the
  // new location in Google Maps, Share > Embed a map, copy the src URL.
  {
    slug: "map_embed_url",
    value:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3829.5489437646183!2d88.36460857537602!3d22.69222782857516!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f89d2740f52c59%3A0xddae7ee4bf0cb01!2sElexify%20Industries%20Pvt.%20Ltd.!5e1!3m2!1sen!2sin!4v1789654190769!5m2!1sen!2sin",
    label: "Map Embed URL (Google Maps → Share → Embed a map)",
    type: "contact_info",
  },
  { slug: "social_instagram_url", value: "", label: "Instagram URL", type: "social_links" },
  { slug: "social_facebook_url", value: "", label: "Facebook URL", type: "social_links" },
  { slug: "social_youtube_url", value: "", label: "YouTube URL", type: "social_links" },
  { slug: "social_twitter_url", value: "", label: "X (Twitter) URL", type: "social_links" },
  { slug: "social_telegram_url", value: "", label: "Telegram URL", type: "social_links" },
  { slug: "low_stock_threshold", value: "5", label: "Low Stock Threshold", type: "product_info" },
  { slug: "homepage_video_url", value: "", label: "Homepage Video URL", type: "homepage" },
  { slug: "homepage_video_poster_url", value: "", label: "Homepage Video Poster Image", type: "homepage" },
];

// contact_mobile/contact_email/contact_address were ported from the
// RudrakshaValley template's placeholder values (someone else's phone,
// baseweb.in email, Saltlake address) and never customized for Elexify —
// they're shown directly on /page/contact-us, so leaving them as-is
// misleads customers. $setOnInsert above won't touch a value that already
// exists, so any environment that already ran this seeder needs an
// explicit, exact-match repair (mirrors the legacyTerms/privacyStub
// pattern in seedCmsPages.js) — it only fires if the value is still
// byte-for-byte the untouched placeholder, never overwriting an admin's
// own edit.
const CONTACT_INFO_REPAIRS = {
  contact_mobile: { from: "9064401121", to: "+91 9110976419" },
  contact_email: { from: "support@baseweb.in", to: "support@elexify.online" },
  contact_address: {
    from: "Saltlake, Kolkata - 700091",
    to: "57, T.N. Banerjee Road, Panihati, Kolkata - 700114, West Bengal, India",
  },
};

const REQUIRED_PAGES = [
  {
    slug: "faq",
    title: "Frequently Asked Questions",
    short_description: "Quick answers about Elexify products, orders, payments, shipping, returns, and support.",
    content: "",
  },
  {
    slug: "contact-us",
    title: "Contact Us",
    short_description: "Have a product or order question? Our team is here to help.",
    content: "<p>Send us a message using the form and our support team will respond as soon as possible.</p>",
  },
];

const DEFAULT_MENUS = {
  "main-menu": {
    name: "Main Menu",
    items: [
      { label: "Home", custom_url: "/" },
      { label: "Shop", custom_url: "/products" },
      { label: "Blog", custom_url: "/blog" },
      { label: "Contact Us", custom_url: "/page/contact-us" },
    ],
  },
  "footer-menu": {
    name: "Footer Menu",
    items: [
      { label: "Privacy Policy", custom_url: "/page/privacy-policy" },
      { label: "Terms Of Use", custom_url: "/page/terms-and-conditions" },
      { label: "FAQ", custom_url: "/faq" },
    ],
  },
};

const countMissingMenuItems = async () => {
  let missingMenus = 0;
  for (const [slug] of Object.entries(DEFAULT_MENUS)) {
    const menu = await NavigationMenu.findOne({ slug, deleted_at: null }).lean();
    if (!menu) {
      missingMenus += 1;
      continue;
    }
    const itemCount = await NavigationMenuItem.countDocuments({ menu_id: menu._id, deleted_at: null });
    if (itemCount === 0) missingMenus += 1;
  }
  return missingMenus;
};

const handler = async (context) => {
  if (context.dryRun) {
    const missingSettings = SETTINGS.length - (await SiteSetting.countDocuments({ slug: { $in: SETTINGS.map((s) => s.slug) } }));
    const missingPages = REQUIRED_PAGES.length - (await Page.countDocuments({ slug: { $in: REQUIRED_PAGES.map((p) => p.slug) } }));
    const missingMenus = await countMissingMenuItems();
    const staleContactInfo = await SiteSetting.countDocuments({
      $or: Object.entries(CONTACT_INFO_REPAIRS).map(([slug, { from }]) => ({ slug, value: from })),
    });
    const wouldInsert = missingSettings + missingPages + missingMenus;
    context.logger.info(`Dry run: ${missingSettings} setting(s), ${missingPages} page(s), ${missingMenus} navigation menu(s) missing, ${staleContactInfo} stale contact_info value(s) to repair.`);
    return { wouldInsert, wouldUpdate: staleContactInfo, wouldSkip: 0, wouldDelete: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  let repaired = 0;

  for (const [slug, { from, to }] of Object.entries(CONTACT_INFO_REPAIRS)) {
    const result = await SiteSetting.updateOne(
      { slug, value: from },
      { $set: { value: to, updated_at: new Date() } },
    );
    if (result.modifiedCount) {
      repaired += 1;
      context.logger.info(`Repaired stale contact_info value: ${slug}`);
    }
  }

  for (const setting of SETTINGS) {
    const result = await SiteSetting.updateOne(
      { slug: setting.slug },
      { $setOnInsert: { ...setting, created_at: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount || result.upserted?.length) {
      inserted += 1;
      context.logger.info(`Created setting: ${setting.slug}`);
    } else {
      skipped += 1;
    }
  }

  for (const page of REQUIRED_PAGES) {
    const result = await Page.updateOne(
      { slug: page.slug },
      { $setOnInsert: { ...page, status: "active", extra: { categories: [], images: [] }, created_at: new Date() } },
      { upsert: true },
    );
    if (result.upsertedCount || result.upserted?.length) {
      inserted += 1;
      context.logger.info(`Created page: ${page.slug}`);
    } else {
      skipped += 1;
    }
  }

  let seededAnyMenu = false;
  for (const [slug, config] of Object.entries(DEFAULT_MENUS)) {
    const menu = await NavigationMenu.findOneAndUpdate(
      { slug, deleted_at: null },
      { $setOnInsert: { slug, name: config.name, status: "published", published_at: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const existingItemCount = await NavigationMenuItem.countDocuments({ menu_id: menu._id, deleted_at: null });
    if (existingItemCount > 0) {
      skipped += 1;
      continue;
    }

    for (const [order, item] of config.items.entries()) {
      const published_snapshot = {
        label: item.label, type: "custom_url", icon: null, badge: null,
        reference_id: null, reference_model: null, custom_url: item.custom_url,
        target: "_self", order, enabled: true, schedule: null,
        mega_menu_content: null, parent_id: null,
      };
      await NavigationMenuItem.create({
        menu_id: menu._id, type: "custom_url", label: item.label,
        custom_url: item.custom_url, order, is_published: true, published_snapshot,
      });
    }
    inserted += 1;
    seededAnyMenu = true;
    context.logger.info(`Seeded navigation menu: ${slug}`);
  }

  if (seededAnyMenu) navigationService.invalidate();

  context.logger.info(`Core site bootstrap complete: ${inserted} created, ${repaired} repaired, ${skipped} already present.`);
  return { inserted, updated: repaired, skipped, deleted: 0, warnings: [] };
};

const healthCheck = async () => {
  const settingCount = await SiteSetting.countDocuments({ slug: { $in: SETTINGS.map((s) => s.slug) } });
  const pageCount = await Page.countDocuments({ slug: { $in: REQUIRED_PAGES.map((p) => p.slug) } });
  const menuCount = await NavigationMenu.countDocuments({ slug: { $in: Object.keys(DEFAULT_MENUS) }, deleted_at: null });
  const expected = SETTINGS.length + REQUIRED_PAGES.length + Object.keys(DEFAULT_MENUS).length;
  const actual = settingCount + pageCount + menuCount;
  return {
    status: actual >= expected ? "HEALTHY" : "DEGRADED",
    expected,
    actual,
    detail: `${settingCount}/${SETTINGS.length} settings, ${pageCount}/${REQUIRED_PAGES.length} pages, ${menuCount}/${Object.keys(DEFAULT_MENUS).length} nav menus present.`,
  };
};

export default {
  key: "core-site-bootstrap",
  name: "Core Site Bootstrap",
  description: "Seeds required site settings, FAQ/Contact pages, and default navigation menus so a fresh environment isn't blank. Absorbed from the legacy unauthenticated /debug/db-seeding route.",
  type: "SEEDER",
  category: "content",
  version: 1,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: `Upserts up to ${SETTINGS.length} settings, ${REQUIRED_PAGES.length} pages, ${Object.keys(DEFAULT_MENUS).length} navigation menus — all insert-if-missing only.`,
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
