/**
 * Reconciles the storefront's "footer-menu" NavigationMenu to exactly the
 * four policy links shown in the footer's "Our Policies" section: Privacy
 * Policy, Refund & Cancellations, Terms & Conditions, About Us.
 *
 * Unlike the "skip if items already exist" default-menu bootstrap
 * (core-site-bootstrap.js), this seeder is meant to be re-run to bring an
 * already-populated footer-menu back to exactly this set — any existing
 * item whose custom_url isn't one of the four is soft-deleted, and the four
 * are created or updated (label/order/url) idempotently. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/seedFooterPolicies.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import NavigationMenu from "../models/NavigationMenu.js";
import NavigationMenuItem from "../models/NavigationMenuItem.js";
import { navigationService } from "../services/index.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const FOOTER_POLICY_ITEMS = [
  { label: "Privacy Policy", custom_url: "/privacy-policy" },
  { label: "Refund & Cancellations", custom_url: "/refund-cancellations-policy" },
  { label: "Terms & Conditions", custom_url: "/terms-conditions" },
  { label: "About Us", custom_url: "/about-us" },
];

const buildSnapshot = (item, order) => ({
  label: item.label,
  type: "custom_url",
  icon: null,
  badge: null,
  reference_id: null,
  reference_model: null,
  custom_url: item.custom_url,
  target: "_self",
  order,
  enabled: true,
  schedule: null,
  mega_menu_content: null,
  parent_id: null,
});

export const runSeedFooterPolicies = async ({ logger = createLogger() } = {}) => {
  const menu = await NavigationMenu.findOneAndUpdate(
    { slug: "footer-menu", deleted_at: null },
    {
      $setOnInsert: {
        slug: "footer-menu",
        name: "Footer Menu",
        status: "published",
        published_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const existingItems = await NavigationMenuItem.find({ menu_id: menu._id, deleted_at: null });
  const desiredUrls = new Set(FOOTER_POLICY_ITEMS.map((item) => item.custom_url));

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const item of existingItems) {
    if (!desiredUrls.has(item.custom_url)) {
      item.deleted_at = new Date();
      await item.save();
      removed += 1;
      logger.info(`Removed footer item no longer in the policy list: ${item.label} (${item.custom_url})`);
    }
  }

  for (const [order, item] of FOOTER_POLICY_ITEMS.entries()) {
    const existing = existingItems.find((i) => i.custom_url === item.custom_url && !i.deleted_at);
    const published_snapshot = buildSnapshot(item, order);

    if (existing) {
      const changed =
        existing.label !== item.label || existing.order !== order || !existing.enabled || !existing.is_published;
      if (changed) {
        existing.label = item.label;
        existing.order = order;
        existing.enabled = true;
        existing.is_published = true;
        existing.status = "active";
        existing.published_snapshot = published_snapshot;
        await existing.save();
        updated += 1;
        logger.info(`Updated footer item: ${item.label} -> ${item.custom_url}`);
      }
      continue;
    }

    await NavigationMenuItem.create({
      menu_id: menu._id,
      type: "custom_url",
      label: item.label,
      custom_url: item.custom_url,
      order,
      enabled: true,
      status: "active",
      is_published: true,
      published_snapshot,
    });
    created += 1;
    logger.info(`Created footer item: ${item.label} -> ${item.custom_url}`);
  }

  navigationService.invalidate();

  logger.info(`Footer policy links seed complete: ${created} created, ${updated} updated, ${removed} removed.`);

  return {
    logs: logger.logs,
    summary: { total: FOOTER_POLICY_ITEMS.length, created, updated, removed },
    result: buildResult({ inserted: created, updated, deleted: removed }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runSeedFooterPolicies();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
