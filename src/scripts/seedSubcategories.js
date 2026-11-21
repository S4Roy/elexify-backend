// Creates subcategories under the main categories and assigns products to
// them (Product.sub_categories). The storefront category page shows a
// category's subcategories as pills under its title and as a "Subcategory"
// filter in the sidebar; the product list already matches either
// `categories` or `sub_categories`.
//
// A product gets a subcategory when it belongs to the parent category and its
// name matches the rule's pattern (first matching rule per parent wins).
// Subcategories are matched by slug, so re-running never duplicates them;
// each subcategory's image is taken from its first product. Writes a JSON
// backup of every product's previous sub_categories before applying.
//
// Usage:
//   node src/scripts/seedSubcategories.js            # apply
//   node src/scripts/seedSubcategories.js --dry-run  # report only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

// parent slug → [subcategory name, slug, name pattern] (order = sort order)
export const SUBCATEGORY_RULES = {
  "audio-boards": [
    ["Class D Amplifier Boards", "class-d-amplifier-boards", /class d|irs2092/i],
    ["Speaker Protection Boards", "speaker-protection-boards", /speaker protection circuit/i],
    ["Pre-Amplifier & Tone Boards", "pre-amplifier-tone-boards", /pre.?amplifier|bass|treble|subwoofer filter|crossover/i],
    ["Amplifier Boards", "amplifier-boards", /amplifier board/i],
  ],
  "amplifier-cabinets": [
    ["Ready Amplifiers", "ready-amplifiers", /stereo amplifier\b(?! board)/i],
    ["Amplifier Cabinets & Enclosures", "amplifier-cabinet-enclosures", /cabinet/i],
    ["Panels & Accessories", "amplifier-panels-accessories", /panel|fan/i],
  ],
  "amplifier-power-supply-boards": [
    ["Soft Starters", "amplifier-soft-starters", /soft start/i],
    ["DC Converters", "amplifier-dc-converters", /converter/i],
    ["Power Supply Boards", "amplifier-power-supply-board", /power supply/i],
  ],
  transformers: [
    ["Inverter Transformers", "inverter-transformers", /inverter transformer/i],
    ["Isolation Transformers", "isolation-transformers", /isolation/i],
    ["Line Matching Transformers", "line-matching-transformers", /line matching/i],
    ["Stabilizers", "stabilizers", /stabilizer/i],
    ["Audio Power Transformers", "audio-power-transformers", /transformer/i],
  ],
  "lithium-battery": [
    ["Battery Management Systems (BMS)", "bms", /\bBMS\b|battery management|protection balance/i],
    ["Chargers & Adapters", "battery-chargers", /charger/i],
    ["Battery Packs", "lithium-battery-packs", /battery pack|12\.8V .*(LiFePO4|Battery)|36V .*Battery/i],
    ["Battery Cells", "lithium-battery-cells", /cell|rechargeable ba|\b(32140|32700)\b.*mAh/i],
    ["Meters & Solar Controllers", "battery-meters-controllers", /meter|solar charge/i],
    ["Holders, Strips & Accessories", "battery-accessories", /holder|nickel|insulation|tape|heat shrink|enclosure|spot welding|connector|SB50/i],
  ],
  "inverter-kit": [
    ["Ready Inverters (UPS)", "ready-inverters", /full automatic inverter \(ups\)/i],
    ["Solar Charge Controllers", "solar-charge-controllers", /solar charge/i],
    ["Inverter Kits", "inverter-kits", /inverter kit/i],
    ["Transformers for Inverter Kits", "inverter-kit-transformers", /transformer/i],
    ["Inverter Kit Cabinets & Hardware", "inverter-kit-cabinets", /cabinet/i],
  ],
  "inverter-cabinets": [
    ["Inverter Cabinet Enclosures", "inverter-cabinet-enclosures", /cabinet/i],
    ["Meters", "panel-meters", /meter/i],
    ["Fans & Accessories", "inverter-cabinet-accessories", /fan/i],
  ],
  "transistors-mosfets": [
    ["MOSFETs", "mosfets", /mosfet/i],
    ["Power Transistors", "power-transistors", /pair|3773/i],
    ["Small Signal Transistors", "small-signal-transistors", /BC5|BD1|2N5/i],
  ],
  "capacitors-polar": [
    ["Filter Capacitors (High Value)", "filter-capacitors", /\d{4,}uF|560uF/i],
    ["Electrolytic Capacitors (Small)", "small-electrolytic-capacitors", /pack of/i],
  ],
  tools: [
    ["Screwdriver Sets", "screwdriver-sets", /screwdriver/i],
    ["Soldering & Welding", "soldering-welding", /solder|spot welding/i],
    ["Testers", "testers", /tester|test pen/i],
  ],
};

export const runSeedSubcategories = async ({ apply = true, logger = createLogger() } = {}) => {
  logger.info(apply ? "=== Seeding subcategories ===" : "=== DRY RUN — no writes ===");

  const parents = await Category.find({
    slug: { $in: Object.keys(SUBCATEGORY_RULES) },
    deleted_at: null,
  }).lean();
  const missing = Object.keys(SUBCATEGORY_RULES).filter((s) => !parents.some((p) => p.slug === s));
  if (missing.length) throw new Error(`Unknown parent category slug(s): ${missing.join(", ")}`);

  const products = await Product.find({ deleted_at: null }).select("_id name categories sub_categories images").lean();

  // product id → subcategory slugs; subcategory slug → first product image
  const assign = new Map();
  const imageFor = new Map();
  const counts = new Map();
  for (const parent of parents) {
    const rules = SUBCATEGORY_RULES[parent.slug];
    for (const p of products) {
      if (!(p.categories ?? []).some((id) => String(id) === String(parent._id))) continue;
      const rule = rules.find(([, , re]) => re.test(p.name));
      if (!rule) {
        logger.info(`  (no subcategory) ${parent.slug}: ${p.name.slice(0, 60)}`);
        continue;
      }
      const slug = rule[1];
      assign.set(String(p._id), [...(assign.get(String(p._id)) ?? []), slug]);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
      if (!imageFor.has(slug) && p.images?.[0]) imageFor.set(slug, p.images[0]);
    }
  }

  // Upsert subcategories (only those that actually get products).
  const idBySlug = new Map();
  for (const parent of parents) {
    let order = 0;
    for (const [name, slug] of SUBCATEGORY_RULES[parent.slug]) {
      order += 1;
      const n = counts.get(slug) ?? 0;
      logger.info(`${parent.slug} › ${name}: ${n} product(s)`);
      if (!n) continue;
      if (!apply) continue;
      const doc = await Category.findOneAndUpdate(
        { slug },
        {
          $set: { name, parent_category: parent._id, sort_order: order, status: "active", deleted_at: null },
          $setOnInsert: {
            slug,
            path: `${parent.path || parent.slug}/${slug}`,
            image: imageFor.get(slug) ?? parent.image ?? null,
            created_by: parent.created_by ?? null,
          },
        },
        { upsert: true, new: true },
      );
      idBySlug.set(slug, doc._id);
    }
  }

  const changes = [];
  for (const p of products) {
    const slugs = assign.get(String(p._id)) ?? [];
    if (!slugs.length) continue;
    changes.push({ _id: p._id, name: p.name, before: p.sub_categories ?? [], slugs });
  }
  logger.info(`${changes.length} product(s) ${apply ? "assigned" : "would be assigned"} to subcategories.`);

  if (apply && changes.length) {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `product-subcategories-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(changes.map(({ _id, name, before }) => ({ _id, name, sub_categories: before })), null, 2));
    logger.info(`Backup written: ${file}`);
    await Product.bulkWrite(
      changes.map((c) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { sub_categories: c.slugs.map((s) => idBySlug.get(s)).filter(Boolean) } },
        },
      })),
    );
  }

  return {
    logs: logger.logs,
    result: apply
      ? buildResult({ updated: changes.length })
      : buildResult({ warnings: [`Dry run: would assign ${changes.length} product(s)`] }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = !process.argv.includes("--dry-run");
    const { logs } = await runSeedSubcategories({ apply });
    for (const { level, message } of logs) console.log(`[${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
