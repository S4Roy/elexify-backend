// Fixes product → category assignments. Many products were bulk-tagged into
// unrelated categories (screwdrivers under Audio Boards/AVR Boards, batteries
// and BMS under Inverter Kit, …). Each rule below matches products by name
// and sets their `categories` array; the FIRST slug is the product's primary
// category — the storefront breadcrumb (Home › All Categories › <primary> ›
// product) and related-products shelf use it.
//
// Rules are checked in order; the first match wins. Products that match no
// rule are left untouched. Idempotent; writes a JSON backup before applying.
//
// Usage:
//   node src/scripts/fixProductCategories.js            # apply
//   node src/scripts/fixProductCategories.js --dry-run  # report only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const CATEGORY_RULES = [
  // Workshop tools
  [/screwdriver|tester|test pen|soldering iron|soldering wire/i, ["tools"]],
  [/spot welding/i, ["tools", "lithium-battery"]],
  [/stabilizer/i, ["transformers", "home-audio"]],
  [/cooling fan/i, ["amplifier-cabinets", "inverter-cabinets"]],

  // Amplifiers & cabinets
  [/EH Series .*Stereo Amplifier/i, ["home-audio", "amplifier-cabinets"]],
  [/amplifier cabinet|bluetooth panel/i, ["amplifier-cabinets"]],

  // E-bike
  [/bicycle/i, ["e-bike"]],
  [/battery enclosure box/i, ["lithium-battery", "e-bike"]],

  // Inverter
  [/inverter transformer/i, ["transformers", "inverter-kit"]],
  [/full automatic inverter \(ups\)/i, ["inverter-kit", "inverter-cabinets"]],
  [/inverter cabinet/i, ["inverter-cabinets", "inverter-kit"]],
  [/solar charge controller/i, ["inverter-kit", "lithium-battery"]],
  [/display meter|volt amp meter/i, ["inverter-cabinets", "lithium-battery"]],

  // Lithium battery parts (were also tagged Inverter Kit)
  [/\bXT60\b|\bSB50\b/i, ["connectors", "lithium-battery"]],
  [/\bBMS\b|battery management|lifepo4|li-?ion|battery holder|nickel strip|insulation ring|charger|battery cell|\b(18650|32140|32700)\b/i, ["lithium-battery"]],
];

// Category display-name fixes (slug → name).
export const CATEGORY_NAME_FIXES = { tools: "Tools" };

const pickRule = (name) => CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? null;

export const runFixProductCategories = async ({ apply = true, logger = createLogger() } = {}) => {
  logger.info(apply ? "=== Applying category fixes ===" : "=== DRY RUN — no writes ===");

  const cats = await Category.find({ deleted_at: null }).select("_id slug").lean();
  const idBySlug = new Map(cats.map((c) => [c.slug, c._id]));
  const slugById = new Map(cats.map((c) => [String(c._id), c.slug]));

  const missing = [...new Set(CATEGORY_RULES.flatMap(([, s]) => s))].filter((s) => !idBySlug.has(s));
  if (missing.length) throw new Error(`Unknown category slug(s): ${missing.join(", ")}`);

  for (const [slug, name] of Object.entries(CATEGORY_NAME_FIXES)) {
    const cat = await Category.findOne({ slug, deleted_at: null }).select("name").lean();
    if (!cat || cat.name === name) continue;
    logger.info(`${apply ? "rename" : "would rename"} category ${slug}: "${cat.name}" → "${name}"`);
    if (apply) await Category.updateOne({ _id: cat._id }, { $set: { name } });
  }

  const products = await Product.find({ deleted_at: null }).select("_id name categories").lean();
  const changes = [];
  for (const p of products) {
    const target = pickRule(p.name);
    if (!target) continue;
    const current = (p.categories ?? []).map((id) => slugById.get(String(id)) ?? String(id));
    if (current.join("|") === target.join("|")) continue;
    changes.push({ _id: p._id, name: p.name, from: current, to: target, before: p.categories });
    logger.info(`${apply ? "fix" : "would fix"}: ${p.name.slice(0, 60)}  [${current.join(", ")}] → [${target.join(", ")}]`);
  }

  if (apply && changes.length) {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `product-categories-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(changes.map(({ _id, name, before }) => ({ _id, name, categories: before })), null, 2));
    logger.info(`Backup written: ${file}`);

    await Product.bulkWrite(
      changes.map((c) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { categories: c.to.map((s) => idBySlug.get(s)) } },
        },
      })),
    );
  }

  logger.info(`${changes.length} product(s) ${apply ? "updated" : "would change"}.`);
  return {
    logs: logger.logs,
    result: apply
      ? buildResult({ updated: changes.length })
      : buildResult({ warnings: [`Dry run: would update ${changes.length} product(s)`] }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = !process.argv.includes("--dry-run");
    const { logs } = await runFixProductCategories({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
