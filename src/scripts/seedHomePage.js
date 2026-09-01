/**
 * Seeds the homepage singleton with sections reproducing the previously
 * hardcoded homepage (Hero, flash-sale product row, Popular Category,
 * New Arrivals, Trust badges, Recently Launched, CTA/Newsletter row, Site
 * description) so the site never goes blank mid-migration to the CMS-driven
 * homepage. Safe to re-run — it's a no-op once any sections already exist.
 *
 * The Hero section is seeded with an empty `slides` array — there's no safe,
 * environment-portable Media id to assume for the banner images, so the
 * admin adds the first slide(s) via Home Page Management right after
 * seeding (the section itself, and its place in the order, is already set
 * up for them).
 *
 * Usage:
 *   node src/scripts/seedHomePage.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import HomePage from "../models/HomePage.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runSeedHomePage = async ({ logger = createLogger() } = {}) => {
  const homePage = await HomePage.getSingleton();
  if (homePage.sections.length) {
    logger.info("Homepage already has sections — nothing to seed.");
    return { logs: logger.logs, summary: { created: 0, skipped: 1 }, result: buildResult({ skipped: 1 }) };
  }

  homePage.sections.push(
    { type: "hero", title: "Hero", order: 0, config: { slides: [] } },
    {
      type: "product_section",
      title: "November Super Flash Sale",
      order: 1,
      config: { source_mode: "latest", limit: 5, badge_icon: "zap" },
    },
    {
      type: "category_section",
      title: "Popular Category",
      order: 2,
      config: { source_mode: "all", limit: 6 },
    },
    {
      type: "product_section",
      title: "New Arrival Products",
      order: 3,
      config: {
        source_mode: "latest",
        limit: 10,
        view_all_link: "/products?sort=newest",
      },
    },
    {
      type: "trust_badges",
      order: 4,
      config: {
        items: [
          { icon: "store", label: "Your Trusted", sub: "Electronic Store" },
          { icon: "truck", label: "Free fast express", sub: "delivery with tracking" },
          {
            icon: "shield",
            label: "Secure Packaging &",
            sub: "Damage Control Measures",
          },
          { icon: "card", label: "Credit/Debit/UPI", sub: "Payment Method Accepted" },
        ],
      },
    },
    {
      type: "product_section",
      title: "Recently Launched",
      order: 5,
      config: { source_mode: "latest", limit: 10, view_all_link: "/products" },
    },
    {
      type: "cta_banner",
      order: 6,
      config: {
        heading: "Now it's easier to open your shop",
        description: "With simple step by step and easy help instructions to follow",
        button_label: "Open Shop",
        button_link: "/seller/register",
        show_newsletter_panel: true,
      },
    },
    {
      type: "content_section",
      order: 7,
      config: {
        heading: "Elexify Online",
        body:
          "<p>your ultimate destination for all things electronic! We are dedicated to " +
          "providing you with a seamless shopping experience where you can explore and " +
          "purchase a wide range of electronic products at competitive prices.</p>" +
          "<p>We understand the importance of quality, reliability, and innovation in " +
          "electronics. Whether you're looking for the latest smartphones, cutting-edge " +
          "laptops, high-definition TVs, or state-of-the-art smart home devices, you'll " +
          "find that you have access to the most sought-after brands and products in " +
          "the market.</p>",
      },
    },
  );

  homePage.published_sections = JSON.parse(JSON.stringify(homePage.sections));
  homePage.status = "published";
  homePage.published_at = new Date();
  await homePage.save();

  logger.info(`Seeded and published ${homePage.sections.length} homepage sections.`);
  return {
    logs: logger.logs,
    summary: { created: homePage.sections.length, skipped: 0 },
    result: buildResult({ inserted: homePage.sections.length }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runSeedHomePage();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
