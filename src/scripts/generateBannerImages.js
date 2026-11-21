// src/scripts/generateBannerImages.js
// Builds on-brand homepage banner images from the store's own product photos
// (no stock art): a light teal brand background with a soft accent shape and
// circuit-line texture, the category's product cut-outs grouped on the right,
// and a clean left side for the headline the storefront overlays.
//
//   node src/scripts/generateBannerImages.js --preview [dir]  # write JPEGs only
//   node src/scripts/generateBannerImages.js                  # upload + Media docs
//
// Upload mode writes each image to S3 under banners/generated/<name>.jpg (with a
// 600px thumbnail) and upserts a Media doc for it. Keys are fixed, so re-runs
// replace the same files and reuse the same Media docs. seedHomeBanners.js
// picks these up automatically when they exist.
//
// Sizes: hero 1600×600 (desktop) and 800×800 (mobile); promo tiles 800×600.

import fs from "fs";
import path from "path";
import sharp from "sharp";
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { envs } from "../config/index.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Media from "../models/Media.js";
import { s3Handler } from "../services/s3Handler/s3Handler.js";

const PREVIEW = process.argv.includes("--preview");
const PREVIEW_DIR = PREVIEW ? path.resolve(process.argv[process.argv.indexOf("--preview") + 1] || "banner-previews") : null;
const log = (...a) => console.log(PREVIEW ? "[preview]" : "[upload]", ...a);

// Banner name → category and how many products to show.
export const BANNERS = [
  { name: "hero-transformers", category: "transformers", kind: "hero", count: 3 },
  { name: "hero-inverter-kit", category: "inverter-kit", kind: "hero", count: 3 },
  { name: "hero-lithium-battery", category: "lithium-battery", kind: "hero", count: 3 },
  { name: "hero-audio-boards", category: "audio-boards", kind: "hero", count: 3 },
  { name: "promo-resistor", category: "resistor", kind: "promo", count: 2, extraCategory: "capacitors-polar" },
  { name: "promo-transistors-mosfets", category: "transistors-mosfets", kind: "promo", count: 2, extraCategory: "ic-integrated-circuit" },
  { name: "promo-tools", category: "tools", kind: "promo", count: 2 },
];

const SIZES = {
  hero: [{ suffix: "desktop", w: 1600, h: 600 }, { suffix: "mobile", w: 800, h: 800 }],
  promo: [{ suffix: "desktop", w: 800, h: 600 }],
};

const BRAND = "#00796A";

const background = (w, h) => {
  // Diagonal light-teal gradient, a large soft accent circle behind the
  // products and faint circuit traces — all vector, so it scales to any size.
  const cx = Math.round(w * (w > h ? 0.72 : 0.5));
  const cy = Math.round(h * (w > h ? 0.5 : 0.62));
  const r = Math.round(Math.min(w, h) * (w > h ? 0.62 : 0.42));
  const traces = Array.from({ length: 9 }, (_, i) => {
    const y = Math.round((h / 10) * (i + 1));
    const x1 = Math.round(w * (0.04 + (i % 3) * 0.05));
    const x2 = x1 + Math.round(w * (0.18 + (i % 4) * 0.04));
    return `<path d="M${x1} ${y} H${x2} l${Math.round(h * 0.04)} ${Math.round(h * 0.04)} H${x2 + Math.round(w * 0.08)}" />
      <circle cx="${x2 + Math.round(w * 0.08)}" cy="${y + Math.round(h * 0.04)}" r="4" />`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F4FAF9"/><stop offset="1" stop-color="#DCEFEB"/>
      </linearGradient>
      <radialGradient id="c" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
        <stop offset="0.7" stop-color="#FFFFFF" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g fill="none" stroke="${BRAND}" stroke-opacity="0.10" stroke-width="2">${traces}</g>
    <g fill="${BRAND}" fill-opacity="0.10">${traces.match(/<circle[^>]*\/>/g)?.join("") ?? ""}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#c)"/>
    <rect x="0" y="${h - 6}" width="${w}" height="6" fill="${BRAND}" fill-opacity="0.85"/>
  </svg>`);
};

const fetchImage = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

// Product photos are shot on white; trimming the white border gives a cut-out
// we can place freely (multiply blending hides what little white remains).
const cutout = async (buf, box) =>
  sharp(buf)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 18 })
    .resize({ width: box, height: box, fit: "inside" })
    .toBuffer();

const pickProducts = async (slugs, count) => {
  const cats = await Category.find({ slug: { $in: slugs }, deleted_at: null }).select("_id").lean();
  const ids = cats.map((c) => c._id);
  const products = await Product.find({
    deleted_at: null,
    status: "active",
    "images.0": { $exists: true },
    $or: [{ categories: { $in: ids } }, { sub_categories: { $in: ids } }],
  })
    .sort({ is_bestseller: -1, is_featured: -1, avg_rating: -1, created_at: -1 })
    .select("name images")
    .limit(count * 4)
    .lean();
  const out = [];
  for (const p of products) {
    if (out.length >= count) break;
    const media = await Media.findOne({ _id: p.images[0], deleted_at: null }).select("url").lean();
    if (!media?.url) continue;
    const url = /^https?:/.test(media.url) ? media.url : `${envs.s3.BASE_URL}${media.url}`;
    try {
      out.push({ name: p.name, buf: await fetchImage(url) });
    } catch (e) {
      log(`  skip ${p.name}: ${e.message}`);
    }
  }
  return out;
};

const compose = async (products, { w, h }) => {
  const wide = w > h;
  // Product slots: a fanned group on the right (wide) or lower half (square).
  const slots = wide
    ? [
        { x: 0.70, y: 0.50, s: 0.78 },
        { x: 0.52, y: 0.60, s: 0.56 },
        { x: 0.88, y: 0.62, s: 0.50 },
      ]
    : w / h > 1.2
      ? [
          { x: 0.68, y: 0.55, s: 0.70 },
          { x: 0.42, y: 0.62, s: 0.52 },
        ]
      : [
          { x: 0.50, y: 0.66, s: 0.52 },
          { x: 0.24, y: 0.74, s: 0.34 },
          { x: 0.78, y: 0.74, s: 0.34 },
        ];
  const layers = [];
  // Smaller side products first so the hero product sits on top.
  const placed = products.slice(0, slots.length).map((p, i) => ({ p, slot: slots[i] })).reverse();
  for (const { p, slot } of placed) {
    const box = Math.round(Math.min(w, h) * slot.s);
    const img = await cutout(p.buf, box);
    const meta = await sharp(img).metadata();
    const left = Math.max(0, Math.min(w - meta.width, Math.round(w * slot.x - meta.width / 2)));
    const top = Math.max(0, Math.min(h - meta.height - 8, Math.round(h * slot.y - meta.height / 2)));
    layers.push({ input: img, left, top, blend: "multiply" });
  }
  return sharp(background(w, h)).composite(layers).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
};

const upsertMedia = async (key, altText) => {
  const existing = await Media.findOne({ url: key, deleted_at: null });
  if (existing) return existing;
  return Media.create({ url: key, type: "image", alt_text: altText, mime_type: "image/jpeg", reference_type: "banners", status: "active" });
};

export const runGenerateBannerImages = async () => {
  if (PREVIEW) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const result = {};
  for (const b of BANNERS) {
    // With a second category, take one product from each so both show.
    const products = b.extraCategory
      ? [...(await pickProducts([b.category], 1)), ...(await pickProducts([b.extraCategory], b.count - 1))]
      : await pickProducts([b.category], b.count);
    if (!products.length) {
      log(`${b.name}: no product photos found, skipped`);
      continue;
    }
    log(`${b.name}: ${products.map((p) => p.name.slice(0, 40)).join(" | ")}`);
    result[b.name] = {};
    for (const size of SIZES[b.kind]) {
      const jpg = await compose(products, size);
      const file = `${b.name}-${size.suffix}.jpg`;
      if (PREVIEW) {
        fs.writeFileSync(path.join(PREVIEW_DIR, file), jpg);
        log(`  wrote ${path.join(PREVIEW_DIR, file)} (${Math.round(jpg.length / 1024)} KB)`);
        continue;
      }
      const key = `banners/generated/${file}`;
      await s3Handler.uploadToS3({ data: jpg, mimetype: "image/jpeg" }, key, { optimize: false });
      const thumbKey = `banners/generated/thumbs/${file}`;
      const thumb = await sharp(jpg).resize({ width: 600 }).jpeg({ quality: 80 }).toBuffer();
      await s3Handler.uploadToS3({ data: thumb, mimetype: "image/jpeg" }, thumbKey, { optimize: false });
      const media = await upsertMedia(key, b.name.replace(/-/g, " "));
      if (!media.thumbnail) await Media.updateOne({ _id: media._id }, { $set: { thumbnail: thumbKey } });
      result[b.name][size.suffix] = String(media._id);
      log(`  uploaded ${key} → media ${media._id}`);
    }
  }
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await mongooseConnection;
  try {
    await runGenerateBannerImages();
  } catch (error) {
    console.error("Failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
