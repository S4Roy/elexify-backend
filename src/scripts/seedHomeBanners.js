// src/scripts/seedHomeBanners.js
// Homepage banners for an electronic-components store, in the industry-
// standard shape: a hero carousel (eyebrow label, benefit-led headline, one
// value line, primary + secondary CTA, alt text), a "Shop by project" promo
// row, and the bulk-order CTA banner.
//
//   node src/scripts/seedHomeBanners.js --dry-run   # show the plan only
//   node src/scripts/seedHomeBanners.js             # apply + publish
//
// Images: reuses media already uploaded — the current hero slide whose
// heading/link matches the same category, else that category's banner or
// image. No new uploads needed; swap images later in the admin.
//
// Safety (same rules as applyStorefrontRefresh.js):
//  - Refuses to run when the homepage draft has unpublished admin edits.
//  - JSON backup of the homepage before writing (db-backups/).
//  - Idempotent: hero/CTA are updated in place, the promo row is matched by
//    its title, so a re-run changes nothing.
//  - Copy only states what the owner confirmed (COD, pan-India delivery) or
//    what the product names themselves say. No discount %, no GST/returns.

import fs from "fs";
import path from "path";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import HomePage from "../models/HomePage.js";
import Category from "../models/Category.js";
import Media from "../models/Media.js";
import { validateSectionConfig } from "../services/homepage/validateSectionConfig.js";

const DRY_RUN = process.argv.includes("--dry-run");
const log = (...a) => console.log(DRY_RUN ? "[dry-run]" : "[apply]", ...a);
const plain = (v) => JSON.parse(JSON.stringify(v));

const BULK_QUOTE_URL = "/contact-us?subject=Bulk%20quote";
const PROMO_TITLE = "Shop by project";

// Hero carousel — one slide per hero category, biggest ranges first.
const HERO_SLIDES = [
  {
    category: "transformers",
    match: /transformer/i,
    eyebrow: "100% copper winding",
    heading: "Transformers for every build",
    description: "Audio, inverter and isolation transformers from 12-0-12 V to 70-0-70 V.",
    primary_cta: { label: "Shop transformers", link: "/category/transformers/" },
    secondary_cta: { label: "Inverter transformers", link: "/category/transformers/?sub=inverter-transformers" },
    alt_text: "Elexify copper-wound power transformers",
  },
  {
    category: "inverter-kit",
    match: /inverter/i,
    eyebrow: "Build your own",
    heading: "Inverter kits & cabinets",
    description: "Kits, transformers, cabinets and meters — everything for a DIY inverter.",
    primary_cta: { label: "Shop inverter kits", link: "/category/inverter-kit/" },
    secondary_cta: { label: "Inverter cabinets", link: "/category/inverter-cabinets/" },
    alt_text: "Elexify DIY inverter kit with transformer and cabinet",
  },
  {
    category: "lithium-battery",
    match: /lithium|battery|lifepo/i,
    eyebrow: "LiFePO4 & Li-ion",
    heading: "Lithium batteries & BMS",
    description: "Cells, ready packs, BMS boards and chargers for custom battery builds.",
    primary_cta: { label: "Shop batteries", link: "/category/lithium-battery/" },
    secondary_cta: { label: "BMS boards", link: "/category/lithium-battery/?sub=bms" },
    alt_text: "LiFePO4 battery packs and BMS boards",
  },
  {
    category: "audio-boards",
    match: /amplifier|audio/i,
    eyebrow: "Amplifier boards",
    heading: "Build a better amplifier",
    description: "Amplifier, pre-amp and power supply boards from 100 W to 1500 W.",
    primary_cta: { label: "Shop audio boards", link: "/category/audio-boards/" },
    secondary_cta: { label: "Power supply boards", link: "/category/amplifier-power-supply-boards/" },
    alt_text: "Elexify audio amplifier boards",
  },
];

// Promo row — everyday parts, a carousel (5 visible on desktop) under the hero.
const PROMO_ITEMS = [
  {
    category: "resistor",
    heading: "Resistors & capacitors",
    subheading: "Packs of 5 and 10 for prototyping and repairs",
    cta_label: "Shop now",
    link: "/category/resistor/",
  },
  {
    category: "transistors-mosfets",
    heading: "Transistors & ICs",
    subheading: "Matched power pairs, MOSFETs and regulators",
    cta_label: "Shop now",
    link: "/category/transistors-mosfets/",
  },
  {
    category: "tools",
    heading: "Workshop tools",
    subheading: "Soldering irons, screwdriver sets and testers",
    cta_label: "Shop now",
    link: "/category/tools/",
  },
  {
    category: "speakers",
    heading: "Speakers & home audio",
    subheading: "Woofers, tweeters and ready audio systems",
    cta_label: "Shop now",
    link: "/category/speakers/",
  },
  {
    category: "smps-boards",
    heading: "SMPS & regulators",
    subheading: "Power supply boards and voltage regulator ICs",
    cta_label: "Shop now",
    link: "/category/smps-boards/",
  },
  {
    category: "connectors",
    heading: "Connectors & cables",
    subheading: "Audio leads, wires and board connectors",
    cta_label: "Shop now",
    link: "/category/connectors/",
  },
];

const CTA_BANNER = {
  heading: "Buying in bulk for your business?",
  description: "Special pricing on bulk orders for workshops, installers, repair shops and resellers. Cash on delivery and pan-India shipping.",
  button_label: "Request a bulk quote",
  button_link: BULK_QUOTE_URL,
};

// Content-only comparison: subdocument timestamps and key order differ
// between the draft and published copies even when nothing changed.
const sameContent = (list) =>
  JSON.stringify(list, (k, v) => {
    if (k === "createdAt" || k === "updatedAt") return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]));
    }
    return v;
  });

const idOf = (v) => (v ? String(v._id ?? v) : null);

export const runSeedHomeBanners = async () => {
  const hp = await HomePage.getSingleton();
  const draft = plain(hp.sections);
  if (sameContent(draft) !== sameContent(plain(hp.published_sections))) {
    throw new Error("Homepage draft has unpublished changes. Publish or discard them in the admin first, then re-run.");
  }

  const slugs = [...new Set([...HERO_SLIDES, ...PROMO_ITEMS].map((x) => x.category))];
  const cats = await Category.find({ slug: { $in: slugs }, deleted_at: null }).select("slug banner image").lean();
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  // Generated banners (generateBannerImages.js) win when present: they are
  // light, so their text is dark with no overlay.
  const generated = new Map(
    (await Media.find({ url: /^banners\/generated\//, deleted_at: null }).select("url").lean())
      // .png (transparent promo art) sorts after .jpg, so it wins over an older .jpg.
      .sort((a, b) => a.url.localeCompare(b.url))
      .map((m) => [m.url.replace(/^banners\/generated\//, "").replace(/\.(jpg|png)$/, ""), String(m._id)]),
  );
  const gen = (name, suffix) => generated.get(`${name}-${suffix}`) || null;
  const look = (isGenerated) =>
    isGenerated
      ? { display: "split", text_theme: "dark", overlay_opacity: 0 }
      : { display: "overlay", text_theme: "light", overlay_opacity: 0.45 };

  let hero = draft.find((s) => s.type === "hero");
  if (!hero) throw new Error("No hero section on the homepage — add one in the admin first.");
  const oldSlides = hero.config?.slides ?? [];

  // Hero slides: keep an uploaded image of the same subject where possible.
  const used = new Set();
  const slides = [];
  for (const [i, s] of HERO_SLIDES.entries()) {
    const old = oldSlides.find((o, j) => !used.has(j) && (s.match.test(o.heading || "") || (o.primary_cta?.link || "").includes(s.category)));
    const oldIndex = old ? oldSlides.indexOf(old) : -1;
    if (oldIndex >= 0) used.add(oldIndex);
    const cat = catBySlug.get(s.category);
    const genDesktop = gen(`hero-${s.category}`, "desktop");
    const desktop = genDesktop || idOf(old?.desktop_image) || idOf(cat?.banner) || idOf(cat?.image);
    const mobile = gen(`hero-${s.category}`, "mobile") || (genDesktop ? desktop : idOf(old?.mobile_image)) || desktop;
    if (!desktop) {
      log(`hero slide "${s.heading}": no image found, skipped`);
      continue;
    }
    slides.push({
      desktop_image: desktop,
      mobile_image: mobile,
      eyebrow: s.eyebrow,
      heading: s.heading,
      description: s.description,
      primary_cta: s.primary_cta,
      secondary_cta: s.secondary_cta,
      link: s.primary_cta.link,
      alt_text: s.alt_text,
      text_position: "left",
      ...look(!!genDesktop),
      order: i,
      enabled: true,
      schedule: { startAt: null, endAt: null },
    });
    log(`hero ${i + 1}: ${s.heading} — image from ${genDesktop ? "generated banner" : old ? "existing slide" : "category"}`);
  }
  hero.config = { ...hero.config, slides };

  // Promo row: insert right after hero + trust badges if missing.
  let promo = draft.find((s) => s.type === "promo_banners" && s.title === PROMO_TITLE);
  if (!promo) {
    promo = {
      _id: new mongoose.Types.ObjectId().toString(),
      type: "promo_banners",
      title: PROMO_TITLE,
      subtitle: null,
      enabled: true,
      schedule: { startAt: null, endAt: null },
      config: {},
    };
    const trustIdx = draft.findIndex((s) => s.type === "trust_badges");
    const heroIdx = draft.indexOf(hero);
    draft.splice(Math.max(trustIdx, heroIdx) + 1, 0, promo);
    log(`promo row "${PROMO_TITLE}": added after ${trustIdx > heroIdx ? "trust badges" : "hero"}`);
  }
  promo.config = {
    layout: "carousel",
    items: PROMO_ITEMS.flatMap((p, i) => {
      const cat = catBySlug.get(p.category);
      const genImg = gen(`promo-${p.category}`, "desktop");
      const img = genImg || idOf(cat?.banner) || idOf(cat?.image);
      if (!img) {
        log(`promo "${p.heading}": no category image, skipped`);
        return [];
      }
      log(`promo ${i + 1}: ${p.heading} — image from ${genImg ? "generated banner" : "category"}`);
      return [{
        desktop_image: img,
        mobile_image: img,
        heading: p.heading,
        subheading: p.subheading,
        cta_label: p.cta_label,
        link: p.link,
        alt_text: p.heading,
        text_position: "left",
        ...look(!!genImg),
        order: i,
        enabled: true,
      }];
    }),
  };

  const cta = draft.find((s) => s.type === "cta_banner");
  if (cta) {
    cta.config = { ...cta.config, ...CTA_BANNER };
    log("bulk CTA banner: copy updated (no GST/discount claims)");
  }

  const ordered = draft.map((s, i) => ({ ...s, order: i, config: validateSectionConfig(s.type, s.config) }));
  if (sameContent(ordered) === sameContent(plain(hp.published_sections))) {
    log("nothing to change — banners already up to date");
    return;
  }
  log("section order:", ordered.map((s) => `${s.order}:${s.title || s.type}`).join("  "));
  if (DRY_RUN) return;

  const dir = path.resolve("db-backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `home-banners-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(plain(hp), null, 2));
  log("backup written:", file);

  hp.sections = ordered;
  hp.published_sections = plain(ordered);
  hp.status = "published";
  hp.published_at = new Date();
  await hp.save();
  log("homepage published");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await mongooseConnection;
  try {
    await runSeedHomeBanners();
  } catch (error) {
    console.error("Failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
