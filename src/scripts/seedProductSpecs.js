// Seeds parametric specifications (industry-standard "Power Rating = 50 W",
// "Secondary Voltage = 35-0-35 V" …) extracted from product names into the
// existing Specification (master) + ProductSpecification (per-product value)
// collections. These drive the storefront's spec filters, the spec badges on
// product cards and the spec table on the product page.
//
// Idempotent: masters upsert by `key`, values upsert by {product_id, key}.
// Rows entered by hand in admin (created_by set) are never overwritten.
// Writes a JSON backup of the seeder-owned rows it replaces.
//
// Usage:
//   node src/scripts/seedProductSpecs.js            # apply
//   node src/scripts/seedProductSpecs.js --dry-run  # report extracted values only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Product from "../models/Product.js";
import Specification from "../models/Specification.js";
import ProductSpecification from "../models/ProductSpecification.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const num = (s) => Number(String(s).replace(/,/g, ""));
const fmt = (n) => String(Number(n.toFixed(3)));
const all = (re, s) => [...s.matchAll(re)];

// Tap voltages: "35 0 35", "45-0-45V", "12 0 12-5 AMP" (the "-5" belongs to the amp rating).
const TAP_RE = /\b(\d{1,3})(?:\s+|\s*-\s*)0(?:\s+|\s*-\s*)(\d{1,3})(?=\s*V?\b)/gi;

export const SPECS = [
  {
    key: "secondary_voltage", label: "Secondary Voltage", unit: "V", type: "dropdown", group: "Electrical",
    extract: (n) => {
      if (!/transformer/i.test(n)) return null;
      const m = all(TAP_RE, n).filter((x) => x[1] === x[2]);
      return m[0] ? { string: `${m[0][1]}-0-${m[0][2]} V`, number: num(m[0][1]) } : null;
    },
  },
  {
    key: "aux_winding", label: "Auxiliary Winding", unit: "V", type: "dropdown", group: "Electrical",
    extract: (n) => {
      if (!/transformer/i.test(n)) return null;
      const m = all(TAP_RE, n).filter((x) => x[1] === x[2]);
      const aux = m.find((x) => m[0] && x[1] !== m[0][1]);
      return aux ? { string: `${aux[1]}-0-${aux[2]} V`, number: num(aux[1]) } : null;
    },
  },
  {
    key: "va_rating", label: "VA Rating", unit: "VA", type: "number", group: "Electrical",
    extract: (n) => {
      const m = n.match(/(\d+(?:\.\d+)?)\s*(K)?VA\b/i);
      if (!m) return null;
      const v = num(m[1]) * (m[2] ? 1000 : 1);
      return { string: v >= 1000 ? `${fmt(v / 1000)} kVA` : `${fmt(v)} VA`, number: v };
    },
  },
  {
    key: "power_rating", label: "Power Rating", unit: "W", type: "number", group: "Electrical",
    extract: (n) => {
      // "1000W", "200 Watt", "60 Watt" — but not "W" inside words, and the
      // largest figure in ranges like "200W - 300W" / "100W - 200W".
      const frac = n.match(/\b(\d+)\/(\d+)\s*W\b/i); // resistor "1/4W"
      if (frac) {
        const v = num(frac[1]) / num(frac[2]);
        return { string: `${fmt(v)} W`, number: v };
      }
      const m = all(/(?<![\d.\/])(\d+(?:\.\d+)?)\s*(?:W|Watt)s?\b/gi, n).map((x) => num(x[1]));
      if (!m.length) return null;
      const v = Math.max(...m);
      return { string: `${fmt(v)} W`, number: v };
    },
  },
  {
    key: "current_rating", label: "Current Rating", unit: "A", type: "number", group: "Electrical",
    extract: (n) => {
      const m = all(/(?<![\dx.])(\d+(?:\.\d+)?)\s*-?\s*(?:A|Amps?|AMP)\b(?!h)/gi, n).map((x) => num(x[1]));
      if (!m.length) return null;
      const v = Math.max(...m);
      return { string: `${fmt(v)} A`, number: v };
    },
  },
  {
    key: "voltage", label: "Voltage", unit: "V", type: "number", group: "Electrical",
    extract: (n) => {
      const clean = n.replace(/\d+\s*V\s*[\u2010-\u2015-]\s*\d+\s*V/gi, " ").replace(TAP_RE, " ");
      const m = clean.match(/(?<![\d.\/-])(\d+(?:\.\d+)?)\s*V(?:DC|AC)?\b(?!A)/i);
      return m ? { string: `${fmt(num(m[1]))} V`, number: num(m[1]) } : null;
    },
  },
  {
    key: "capacity", label: "Capacity", unit: "Ah", type: "number", group: "Battery",
    extract: (n) => {
      const mah = n.match(/(\d+)\s*mAh/i);
      const ah = n.match(/\b(\d+(?:\.\d+)?)\s*Ah\b/i);
      const v = mah ? num(mah[1]) / 1000 : ah ? num(ah[1]) : null;
      return v ? { string: `${fmt(v)} Ah`, number: v } : null;
    },
  },
  {
    key: "cell_config", label: "Cell Configuration", unit: null, type: "dropdown", group: "Battery",
    extract: (n) => {
      const m = n.match(/\b(\d{1,2})S\b/);
      return m ? { string: `${m[1]}S`, number: num(m[1]) } : null;
    },
  },
  {
    key: "chemistry", label: "Chemistry", unit: null, type: "dropdown", group: "Battery",
    extract: (n) => {
      if (/lifepo|LFP/i.test(n)) return { string: "LiFePO4", number: null };
      if (/\bNMC\b/i.test(n)) return { string: "NMC", number: null };
      if (/li-?ion/i.test(n)) return { string: "Li-ion", number: null };
      return null;
    },
  },
  {
    key: "capacitance", label: "Capacitance", unit: "µF", type: "number", group: "Electrical",
    extract: (n) => {
      const m = n.match(/(\d+(?:\.\d+)?)\s*(uF|nF)\b/i);
      if (!m) return null;
      const v = num(m[1]) / (m[2].toLowerCase() === "nf" ? 1000 : 1);
      return { string: m[2].toLowerCase() === "nf" ? `${fmt(num(m[1]))} nF` : `${fmt(v)} µF`, number: v };
    },
  },
  {
    key: "resistance", label: "Resistance", unit: "Ω", type: "number", group: "Electrical",
    extract: (n) => {
      const m = n.match(/(\d+(?:\.\d+)?)\s*(K|M)?\s*Ohms?\b/i);
      if (!m) return null;
      const mul = m[2] ? (m[2].toUpperCase() === "K" ? 1e3 : 1e6) : 1;
      const v = num(m[1]) * mul;
      const s = v >= 1e6 ? `${fmt(v / 1e6)} MΩ` : v >= 1e3 ? `${fmt(v / 1e3)} kΩ` : `${fmt(v)} Ω`;
      return { string: s, number: v };
    },
  },
  {
    key: "pack_qty", label: "Pack Quantity", unit: "pcs", type: "number", group: "Packaging",
    extract: (n) => {
      const m = n.match(/pack of (\d+)/i);
      return m ? { string: `Pack of ${m[1]}`, number: num(m[1]) } : null;
    },
  },
];

export const runSeedProductSpecs = async ({ apply = true, logger = createLogger() } = {}) => {
  logger.info(apply ? "=== Seeding product specifications ===" : "=== DRY RUN — no writes ===");

  const masterIds = new Map();
  for (const [i, s] of SPECS.entries()) {
    if (!apply) continue;
    const doc = await Specification.findOneAndUpdate(
      { key: s.key },
      {
        $set: { label: s.label, unit: s.unit, type: s.type, group: s.group, sort_order: i + 1, visible: true, status: "active", deleted_at: null },
        $setOnInsert: { key: s.key },
      },
      { upsert: true, new: true },
    );
    masterIds.set(s.key, doc._id);
  }

  const products = await Product.find({ deleted_at: null }).select("_id name").lean();
  const existing = await ProductSpecification.find({ key: { $in: SPECS.map((s) => s.key) }, deleted_at: null }).lean();
  const existingBy = new Map(existing.map((r) => [`${r.product_id}:${r.key}`, r]));

  const distinct = new Map(SPECS.map((s) => [s.key, new Map()]));
  const ops = [];
  const backup = [];
  for (const p of products) {
    for (const s of SPECS) {
      const v = s.extract(p.name);
      if (!v) continue;
      const counts = distinct.get(s.key);
      counts.set(v.string, (counts.get(v.string) ?? 0) + 1);

      const prev = existingBy.get(`${p._id}:${s.key}`);
      if (prev?.created_by) continue; // hand-entered — leave it
      if (prev && prev.value_string === v.string && prev.value_number === v.number) continue;
      if (prev) backup.push(prev);
      ops.push({
        updateOne: {
          filter: { product_id: p._id, key: s.key, deleted_at: null },
          update: {
            $set: {
              specification_id: masterIds.get(s.key),
              label: s.label,
              unit: s.unit,
              value: v.number ?? v.string,
              value_string: v.string,
              value_number: v.number,
              status: "active",
            },
            $setOnInsert: { product_id: p._id, key: s.key, deleted_at: null },
          },
          upsert: true,
        },
      });
    }
  }

  for (const [key, counts] of distinct) {
    const values = [...counts.entries()].map(([v, c]) => `${v} (${c})`).join(", ");
    logger.info(`${key}: ${values || "—"}`);
  }
  logger.info(`${ops.length} spec value(s) ${apply ? "written" : "would be written"}.`);

  if (apply && ops.length) {
    if (backup.length) {
      const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `product-specs-${Date.now()}.json`);
      fs.writeFileSync(file, JSON.stringify(backup, null, 2));
      logger.info(`Backup written: ${file}`);
    }
    await ProductSpecification.bulkWrite(ops);
  }

  return {
    logs: logger.logs,
    result: apply
      ? buildResult({ updated: ops.length })
      : buildResult({ warnings: [`Dry run: would write ${ops.length} spec value(s)`] }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = !process.argv.includes("--dry-run");
    const { logs } = await runSeedProductSpecs({ apply });
    for (const { level, message } of logs) console.log(`[${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
