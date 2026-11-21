// src/scripts/applyStorefrontRefresh.js
// One-off, idempotent storefront content refresh for an electronic-components
// store: homepage section order and copy, top bar, search placeholder, main
// and mobile menus, featured categories and bestseller flags.
//
//   node src/scripts/applyStorefrontRefresh.js --dry-run   # show the plan only
//   node src/scripts/applyStorefrontRefresh.js             # apply + publish
//
// Safety:
//  - Writes a JSON backup of every document it touches to db-backups/ first.
//  - Refuses to run when the homepage draft differs from what is published
//    (it would otherwise publish someone's unfinished admin edits).
//  - Matches existing records by type/title/label, so re-running is a no-op.
//  - Never touches prices, stock or quantity discounts.
//  - Only states policies the owner confirmed (COD, pan-India delivery).
// The API caches navigation for up to 5 minutes; restart it to see changes now.

import fs from "fs";
import path from "path";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import HomePage from "../models/HomePage.js";
import TopBar from "../models/TopBar.js";
import HeaderConfig from "../models/HeaderConfig.js";
import NavigationMenu from "../models/NavigationMenu.js";
import NavigationMenuItem from "../models/NavigationMenuItem.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { validateSectionConfig } from "../services/homepage/validateSectionConfig.js";

const DRY_RUN = process.argv.includes("--dry-run");
const log = (...a) => console.log(DRY_RUN ? "[dry-run]" : "[apply]", ...a);
const plain = (v) => JSON.parse(JSON.stringify(v));

const BULK_QUOTE_URL = "/contact-us?subject=Bulk%20quote";
const FEATURED_CATEGORY_NAMES = [
  "Audio Boards",
  "AVR Boards",
  "Capacitors (Polar)",
  "IC (integrated circuit)",
  "Inverter Kit",
  "Lithium Battery",
  "Transformers",
  "SMPS Boards",
];

// Coming Sunday 23:59 IST (18:29 UTC); a week later if that is already past.
const nextSundayEndIST = () => {
  const d = new Date();
  d.setUTCHours(18, 29, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
};

const TRUST_ITEMS = [
  { icon: "truck", label: "Pan-India delivery", sub: "Fast shipping with live tracking" },
  { icon: "card", label: "Cash on delivery", sub: "Pay when your order arrives" },
  { icon: "package", label: "Secure packaging", sub: "Packed to prevent transit damage" },
  { icon: "shield", label: "Secure payments", sub: "Credit/Debit cards & UPI" },
];

const CONTENT = {
  heading: "Elexify Online — electronic components, modules & DIY kits",
  body: [
    "<p>Elexify Online is an electronic components store for makers, students, repair technicians and businesses. Shop audio and amplifier boards, power supply and SMPS boards, transformers, capacitors, ICs, transistors and MOSFETs, connectors, lithium batteries and ready-to-build DIY kits such as our inverter kits.</p>",
    "<h2>Parts for every project</h2>",
    "<p>Repairing equipment, building an amplifier or prototyping a new circuit? Browse by category, or search by part number and value, to find the right component quickly.</p>",
    "<h2>Bulk and business orders</h2>",
    "<p>Buying for a workshop, institution or resale? Request a bulk quote and our team will get back to you with pricing.</p>",
  ].join(""),
};

// ── Homepage ────────────────────────────────────────────────────────────────
const refreshHomePage = async (backup) => {
  const hp = await HomePage.getSingleton();
  backup.home_page = plain(hp);

  const draft = plain(hp.sections);
  // Subdocument timestamps differ between the copies even when content is
  // identical, so compare content only.
  // Key order also differs, so normalise it.
  const sameContent = (list) =>
    JSON.stringify(list, (k, v) => {
      if (k === "createdAt" || k === "updatedAt") return undefined;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]));
      }
      return v;
    });
  if (sameContent(draft) !== sameContent(plain(hp.published_sections))) {
    throw new Error(
      "Homepage draft has unpublished changes. Publish or discard them in the admin first, then re-run.",
    );
  }

  const find = (pred) => draft.find(pred);
  const hero = find((s) => s.type === "hero");
  const trust = find((s) => s.type === "trust_badges");
  const flash = find((s) => s.type === "product_section" && /flash/i.test(s.title || ""));
  const category = find((s) => s.type === "category_section");
  const bestSellers = find(
    (s) => s.type === "product_section" && /recently launched|best sellers/i.test(s.title || ""),
  );
  const newArrivals = find((s) => s.type === "product_section" && /new arrival/i.test(s.title || ""));
  const cta = find((s) => s.type === "cta_banner");
  const content = find((s) => s.type === "content_section");
  let reviews = find((s) => s.type === "reviews");

  if (flash) {
    flash.enabled = true;
    flash.title = "Flash Deals";
    // Keep the owner's hand-picked products; only refresh the countdown.
    flash.config = { ...flash.config, badge_icon: "zap", countdown_end_at: nextSundayEndIST() };
    log("flash sale: enabled, renamed 'Flash Deals', countdown", flash.config.countdown_end_at);
  }
  if (trust) {
    trust.config = { ...trust.config, items: TRUST_ITEMS };
    log("trust badges: copy rewritten (confirmed claims only)");
  }
  if (bestSellers) {
    bestSellers.title = "Best Sellers";
    bestSellers.config = { ...bestSellers.config, source_mode: "bestseller" };
    log("'Recently Launched' → 'Best Sellers' (source: bestseller)");
  }
  if (content) {
    content.config = { ...content.config, ...CONTENT };
    log("content section: rewritten for a components store");
  }
  if (!reviews) {
    reviews = {
      _id: new mongoose.Types.ObjectId().toString(),
      type: "reviews",
      title: "What our customers say",
      subtitle: null,
      enabled: true,
      config: { min_rating: 4, limit: 8 },
      schedule: { startAt: null, endAt: null },
    };
    draft.push(reviews);
    log("reviews section: added");
  }

  // Hero → benefits → deals → categories → best sellers → new arrivals →
  // reviews → bulk CTA → about. Anything unrecognised keeps its place after.
  const sequence = [hero, trust, flash, category, bestSellers, newArrivals, reviews, cta, content].filter(Boolean);
  const rest = draft.filter((s) => !sequence.includes(s)).sort((a, b) => a.order - b.order);
  const ordered = [...sequence, ...rest].map((s, i) => ({
    ...s,
    order: i,
    config: validateSectionConfig(s.type, s.config),
  }));
  log("section order:", ordered.map((s) => `${s.order}:${s.title || s.type}${s.enabled ? "" : "(off)"}`).join("  "));

  if (DRY_RUN) return;
  hp.sections = ordered;
  hp.published_sections = plain(ordered);
  hp.status = "published";
  hp.published_at = new Date();
  await hp.save();
};

// ── Top bar + header ────────────────────────────────────────────────────────
const refreshTopBarAndHeader = async (backup) => {
  const topBar = await TopBar.getSingleton();
  backup.top_bar = plain(topBar);
  const announcements = [
    { message: "Fast pan-India delivery with live tracking", icon: "🚚", order: 0, enabled: true },
    { message: "Cash on delivery available", icon: "💵", order: 1, enabled: true },
    { message: "Buying in bulk? Request a quote", icon: "📦", link: BULK_QUOTE_URL, order: 2, enabled: true },
  ];
  const contactItems = [
    { icon: "📞", label: "+91 9110976419", link: "tel:+919110976419", order: 0, enabled: true },
    { icon: "✉️", label: "support@elexify.online", link: "mailto:support@elexify.online", order: 1, enabled: true },
  ];
  log("top bar:", announcements.map((a) => a.message).join(" | "));

  const header = await HeaderConfig.getSingleton();
  backup.header_config = plain(header);
  const placeholder = "Search part no., value or name — e.g. 470uF 25V";
  log("search placeholder:", placeholder);

  if (DRY_RUN) return;
  topBar.announcements = announcements;
  topBar.contact_items = contactItems;
  topBar.published_announcements = announcements;
  topBar.published_contact_items = contactItems;
  topBar.published_settings = plain(topBar.settings ?? topBar.published_settings ?? {});
  topBar.status = "published";
  topBar.published_at = new Date();
  await topBar.save();

  for (const key of ["draft", "published"]) {
    header.set(`${key}.search.placeholder`, placeholder);
  }
  await header.save();
};

// ── Menus ───────────────────────────────────────────────────────────────────
const MENU_ORDER = ["Home", "Shop", "DIY Kits", "Bulk Orders", "Track Order", "Contact Us", "About Us"];
const NEW_ITEMS = {
  "DIY Kits": { type: "custom_url", custom_url: "/category/inverter-kit/" },
  "Bulk Orders": { type: "custom_url", custom_url: BULK_QUOTE_URL },
};

const snapshotOf = (item) => ({
  label: item.label,
  type: item.type,
  icon: item.icon,
  badge: item.badge,
  reference_id: item.reference_id,
  reference_model: item.reference_model,
  custom_url: item.custom_url,
  target: item.target,
  order: item.order,
  enabled: item.enabled,
  schedule: item.schedule,
  mega_menu_content: item.mega_menu_content,
  parent_id: item.parent_id,
});

const refreshMenus = async (backup) => {
  backup.navigation_menu_items = {};
  for (const slug of ["main-menu", "mobile-menu"]) {
    const menu = await NavigationMenu.findOne({ slug, deleted_at: null });
    if (!menu) {
      log(`menu ${slug}: not found, skipped`);
      continue;
    }
    const items = await NavigationMenuItem.find({ menu_id: menu._id, deleted_at: null, parent_id: null });
    backup.navigation_menu_items[slug] = plain(items);

    const byLabel = new Map(items.map((i) => [i.label, i]));
    for (const [label, fields] of Object.entries(NEW_ITEMS)) {
      if (!byLabel.has(label)) {
        byLabel.set(label, new NavigationMenuItem({ menu_id: menu._id, label, status: "active", enabled: true, target: "_self", ...fields }));
      }
    }
    const final = [...byLabel.values()].sort((a, b) => {
      const ia = MENU_ORDER.indexOf(a.label);
      const ib = MENU_ORDER.indexOf(b.label);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.order - b.order;
    });
    final.forEach((item, i) => {
      item.order = i;
      // About Us moves to the footer menu (already listed there).
      if (item.label === "About Us") item.enabled = false;
    });
    log(`menu ${slug}:`, final.map((i) => `${i.label}${i.enabled ? "" : "(hidden)"}`).join(" · "));

    if (DRY_RUN) continue;
    for (const item of final) {
      item.is_published = true;
      item.published_snapshot = snapshotOf(item);
      await item.save();
    }
    menu.status = "published";
    menu.published_at = new Date();
    await menu.save();
  }
};

// ── Catalogue flags ─────────────────────────────────────────────────────────
const refreshCatalogueFlags = async (backup) => {
  const names = FEATURED_CATEGORY_NAMES.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
  const cats = await Category.find({ name: { $in: names }, deleted_at: null }, { name: 1, is_featured: 1 });
  backup.featured_categories_before = plain(await Category.find({ is_featured: true }, { name: 1 }));
  const missing = FEATURED_CATEGORY_NAMES.filter((n) => !cats.some((c) => c.name.toLowerCase() === n.toLowerCase()));
  log("featured categories:", cats.map((c) => c.name).join(", "), missing.length ? `(not found: ${missing.join(", ")})` : "");

  // Bestsellers: top 10 live products by units ordered.
  const top = await mongoose.connection.db
    .collection("order_items")
    .aggregate([
      { $group: { _id: "$product_id", units: { $sum: "$quantity" } } },
      { $sort: { units: -1 } },
      { $limit: 40 },
    ])
    .toArray();
  const live = await Product.find(
    { _id: { $in: top.map((t) => t._id) }, deleted_at: null, status: { $ne: "inactive" } },
    { name: 1 },
  ).lean();
  const liveIds = new Set(live.map((p) => String(p._id)));
  const bestIds = top.filter((t) => liveIds.has(String(t._id))).slice(0, 10);
  const nameOf = new Map(live.map((p) => [String(p._id), p.name]));
  backup.bestsellers_before = plain(await Product.find({ is_bestseller: true }, { name: 1 }).lean());
  log("bestsellers:", bestIds.map((t) => `${nameOf.get(String(t._id))} (${t.units})`).join("; "));

  if (DRY_RUN) return;
  await Category.updateMany({ _id: { $in: cats.map((c) => c._id) } }, { $set: { is_featured: true } });
  await Product.updateMany({ is_bestseller: true }, { $set: { is_bestseller: false } });
  await Product.updateMany({ _id: { $in: bestIds.map((t) => t._id) } }, { $set: { is_bestseller: true } });
};

// ── Run ─────────────────────────────────────────────────────────────────────
// Everything the script may modify, captured and written to disk before
// the first write.
const takeBackup = async () => {
  const menus = await NavigationMenu.find({ slug: { $in: ["main-menu", "mobile-menu"] } }).lean();
  return {
    taken_at: new Date().toISOString(),
    home_page: await HomePage.findOne({}).lean(),
    top_bar: await TopBar.findOne({}).lean(),
    header_config: await HeaderConfig.findOne({}).lean(),
    navigation_menus: menus,
    navigation_menu_items: await NavigationMenuItem.find({ menu_id: { $in: menus.map((m) => m._id) } }).lean(),
    featured_categories: await Category.find({ is_featured: true }, { name: 1 }).lean(),
    bestseller_products: await Product.find({ is_bestseller: true }, { name: 1 }).lean(),
  };
};

export const runApplyStorefrontRefresh = async () => {
  const scratch = {};
  if (!DRY_RUN) {
    const dir = path.resolve("db-backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `storefront-refresh-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(await takeBackup(), null, 2));
    log("backup written:", file);
  }
  for (const step of [refreshHomePage, refreshTopBarAndHeader, refreshMenus, refreshCatalogueFlags]) {
    await step(scratch);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await mongooseConnection;
  try {
    await runApplyStorefrontRefresh();
  } catch (error) {
    console.error("Failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
