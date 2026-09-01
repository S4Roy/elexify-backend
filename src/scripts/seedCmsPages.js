/**
 * Migrates content from the old WordPress site (elexify.online) into the
 * `pages` collection so /about-us, /page/contact-us, /faq, /page/refund-policy
 * and /page/terms-and-conditions render real content instead of "coming
 * soon" placeholders.
 *
 * Idempotent: creates a page only if its slug doesn't already exist, and
 * only repairs the one known-bad record (the placeholder "terms-of-service"
 * page with empty content) by renaming it to the correct slug/content. Safe
 * to re-run.
 *
 * Core logic lives in runSeedCmsPages() so it can be called identically
 * from this CLI entry point, the data-operations registry
 * (seeders/registry/operations/cms-pages.js), and tests — see
 * services/emailTemplate/seedRunner.js for the pattern this generalizes.
 *
 * Usage:
 *   node src/scripts/seedCmsPages.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Page from "../models/Page.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const CONTACT_EMAIL = "support@elexify.online";
const CONTACT_PHONE_DISPLAY = "+91 9110976419";
const CONTACT_PHONE_TEL = "+919110976419";

const pages = [
  {
    slug: "about-us",
    title: "About Elexify",
    short_description:
      "Elexify brings practical electronic products and components together with clear information, fair value, and customer-first service.",
    content:
      "<p>Elexify Online is your destination for dependable electronics — smartphones, laptops, TVs, smart home devices, and everyday accessories, all in one place. We're built around a simple idea: buying electronics online should be easy, transparent, and worry-free.</p>" +
      "<p>We understand the importance of quality, reliability, and innovation when it comes to electronics. Our team carefully curates every product we list, so you have access to trusted brands and dependable options without having to second-guess your purchase.</p>",
  },
  {
    slug: "contact-us",
    title: "Contact Us",
    short_description:
      "Have a question about an order, a product, or your account? Our support team is here to help.",
    content:
      "<p>Reach out any time using the details below, or send us a message and we'll get back to you as soon as we can.</p>",
  },
  {
    slug: "faq",
    title: "Frequently Asked Questions",
    short_description:
      "Quick answers to common questions about orders, shipping, payments, returns, and your account.",
    content: "",
  },
  {
    slug: "refund-policy",
    title: "Refund & Cancellation Policy",
    short_description:
      "Our policy on refunds, returns, and order cancellations.",
    content:
      "<p>At Elexify Online, we aim to provide our customers with high-quality electronics and a satisfactory shopping experience. Please review our refund and cancellation policy below.</p>" +
      "<h2>Refund Policy</h2>" +
      "<h3>Eligibility for Refunds</h3>" +
      "<p>Refunds are applicable under the following circumstances:</p>" +
      "<ul>" +
      "<li><strong>Defective or damaged products:</strong> If the product is defective or damaged upon arrival, you may request a return and refund within 2 days of receipt.</li>" +
      "<li><strong>Incorrect items:</strong> If you receive an incorrect item, please contact us within 2 days for a resolution.</li>" +
      "</ul>" +
      "<h3>Non-Refundable Items</h3>" +
      "<p>Please note that certain items are non-refundable, including:</p>" +
      "<ul><li>Opened software or digital products</li><li>Gift cards</li></ul>" +
      "<h3>Refund Process</h3>" +
      "<p>To initiate a refund, please follow these steps:</p>" +
      "<ol>" +
      `<li><strong>Contact customer support:</strong> Reach out to our support team at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with your order details and the reason for the refund.</li>` +
      "<li><strong>Return the product:</strong> If eligible, you may need to return the item to our specified return address.</li>" +
      "<li><strong>Refund processing:</strong> Once we receive and inspect the returned product, we will process your refund.</li>" +
      "</ol>" +
      "<h3>Refund Timeline</h3>" +
      "<p>Refunds will be processed within 5–7 working days after the returned item has been received and inspected. The credited amount will be transferred to your original payment method.</p>" +
      "<h2>Cancellation Policy</h2>" +
      "<h3>Order Cancellations</h3>" +
      `<p>You may cancel your order at any time before it is shipped. To cancel your order, please contact our customer support team at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> as soon as possible. Once an order has been shipped, it cannot be cancelled.</p>` +
      "<h3>Processing Cancellations</h3>" +
      "<p>Once your cancellation is confirmed, any payments made will be processed back to your account within 5–7 working days.</p>" +
      "<h2>Contact Us</h2>" +
      "<p>If you have any questions or need assistance regarding refunds or cancellations, please contact us:</p>" +
      `<p><strong>Elexify Support</strong><br>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>Phone: <a href="tel:${CONTACT_PHONE_TEL}">${CONTACT_PHONE_DISPLAY}</a></p>`,
  },
  {
    slug: "terms-and-conditions",
    title: "Terms & Conditions",
    short_description:
      "The terms that apply when you browse Elexify Online or purchase our products.",
    content:
      "<p>Welcome to Elexify Online! By accessing our website and purchasing products from us, you agree to the following terms and conditions. Please read them carefully.</p>" +
      "<h2>1. Acceptance of Terms</h2>" +
      "<p>By using this site, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.</p>" +
      "<h2>2. Eligibility</h2>" +
      "<p>To make a purchase on Elexify Online, you must be at least 18 years of age or have parental consent. By placing an order, you confirm that you meet these criteria.</p>" +
      "<h2>3. Product Information</h2>" +
      "<p>We strive to provide accurate product descriptions and images. However, we do not guarantee that all product information is error-free or complete. Prices and availability are subject to change without notice.</p>" +
      "<h2>4. Order Acceptance</h2>" +
      "<p>All orders placed on Elexify Online are subject to acceptance. We reserve the right to refuse or cancel any order for any reason, including but not limited to:</p>" +
      "<ul><li>Product availability</li><li>Errors in product information</li><li>Incorrect pricing</li></ul>" +
      "<h2>5. Payment</h2>" +
      "<p>Payments can be made through the methods indicated on our website. By placing an order, you agree to provide accurate payment information and authorize us to charge your chosen payment method.</p>" +
      "<h2>6. Shipping and Delivery</h2>" +
      "<p>We aim to process and ship orders promptly. However, delivery times may vary based on location and other factors. We are not liable for delays in delivery caused by third-party carriers or unforeseen circumstances.</p>" +
      "<h2>7. Pricing</h2>" +
      "<p>All prices listed on our website are in Indian Rupees (INR) and exclude applicable taxes, shipping, and handling fees unless stated otherwise. Prices may change without notice.</p>" +
      "<h2>8. User Accounts</h2>" +
      "<p>If you create an account on our site, you are responsible for maintaining the confidentiality of your account information, including your password. You agree to notify us immediately of any unauthorized use of your account.</p>" +
      "<h2>9. Intellectual Property</h2>" +
      "<p>All content on Elexify Online, including text, graphics, logos, and images, is the property of Elexify Industries Pvt. Ltd. and is protected by copyright and intellectual property laws. Unauthorized use is prohibited.</p>" +
      "<h2>10. Limitation of Liability</h2>" +
      "<p>Elexify Industries Pvt. Ltd. (elexify.online) is not liable for any direct, indirect, incidental, or consequential damages arising from your use of our website or products purchased through it. Your use of our site is at your own risk.</p>" +
      "<h2>11. Governing Law</h2>" +
      "<p>These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising from these terms shall be resolved in the courts of Calcutta.</p>" +
      "<h2>12. Amendments</h2>" +
      "<p>Elexify reserves the right to modify these Terms and Conditions at any time. Changes will be effective immediately upon posting on the site. Your continued use of the site constitutes acceptance of any changes.</p>" +
      "<h2>13. Contact Information</h2>" +
      "<p>For any questions regarding these Terms and Conditions, please contact us at:</p>" +
      `<p><strong>Elexify Support</strong><br>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>Phone: <a href="tel:${CONTACT_PHONE_TEL}">${CONTACT_PHONE_DISPLAY}</a></p>`,
  },
];

export const runSeedCmsPages = async ({ logger = createLogger() } = {}) => {
  let created = 0;
  let skipped = 0;
  let repaired = 0;

  // Repair the placeholder "terms-of-service" record left over from testing
  // (empty content, wrong slug) instead of leaving it as orphaned junk.
  const legacyTerms = await Page.findOne({ slug: "terms-of-service" });
  const properTerms = pages.find((p) => p.slug === "terms-and-conditions");
  if (legacyTerms && !(await Page.findOne({ slug: "terms-and-conditions" }))) {
    legacyTerms.slug = properTerms.slug;
    legacyTerms.title = properTerms.title;
    legacyTerms.short_description = properTerms.short_description;
    legacyTerms.content = properTerms.content;
    legacyTerms.updated_at = new Date();
    await legacyTerms.save();
    repaired += 1;
    logger.info("Repaired placeholder page -> terms-and-conditions");
  }

  for (const page of pages) {
    const exists = await Page.findOne({ slug: page.slug });
    if (exists) {
      skipped += 1;
      logger.info(`Skipped (already exists): ${page.slug}`);
      continue;
    }
    await Page.create({ ...page, status: "active" });
    created += 1;
    logger.info(`Created page: ${page.slug}`);
  }

  logger.info(`CMS pages seed complete: ${created} created, ${skipped} skipped, ${repaired} repaired.`);

  return {
    logs: logger.logs,
    summary: { total: pages.length, created, skipped, repaired },
    result: buildResult({ inserted: created, updated: repaired, skipped }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runSeedCmsPages();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
