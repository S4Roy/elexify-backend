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
  const wide = w > h;
  // Brand panel: a large curved teal shape behind the product group, with a
  // lighter inner arc for depth; dot-grid texture on the open (text) side.
  const px = wide ? w * 0.46 : 0;
  const py = wide ? 0 : h * 0.42;
  const panel = wide
    ? `M${px} 0 H${w} V${h} H${px + w * 0.06} C${px - w * 0.05} ${h * 0.7} ${px + w * 0.02} ${h * 0.3} ${px} 0 Z`
    : `M0 ${py} C${w * 0.3} ${py - h * 0.08} ${w * 0.7} ${py + h * 0.06} ${w} ${py - h * 0.04} V${h} H0 Z`;
  const arc = wide
    ? `M${px + w * 0.10} 0 C${px + w * 0.02} ${h * 0.35} ${px + w * 0.05} ${h * 0.75} ${px + w * 0.14} ${h}`
    : `M0 ${py + h * 0.08} C${w * 0.35} ${py} ${w * 0.65} ${py + h * 0.12} ${w} ${py + h * 0.04}`;
  const dots = [];
  const step = Math.round(Math.min(w, h) / 22);
  const maxX = wide ? w * 0.42 : w;
  const maxY = wide ? h : h * 0.38;
  for (let y = step; y < maxY; y += step) {
    for (let x = step; x < maxX; x += step) {
      const fade = wide ? 1 - x / maxX : 1 - y / maxY;
      if (fade > 0.12) dots.push(`<circle cx="${x}" cy="${y}" r="1.6" fill-opacity="${(0.05 + fade * 0.12).toFixed(2)}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F7FBFA"/><stop offset="1" stop-color="#E8F3F1"/>
      </linearGradient>
      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#D2ECE7"/><stop offset="1" stop-color="#B5DED6"/>
      </linearGradient>
      <radialGradient id="glow" cx="${wide ? 0.72 : 0.5}" cy="${wide ? 0.48 : 0.66}" r="${wide ? 0.42 : 0.5}">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <g fill="${BRAND}">${dots.join("")}</g>
    <path d="${panel}" fill="url(#panel)"/>
    <path d="${arc}" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="${Math.round(Math.min(w, h) * 0.012)}"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <rect x="0" y="${h - 6}" width="${w}" height="6" fill="${BRAND}"/>
  </svg>`);
};

const fetchImage = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

// Product photos are shot on white. Flood-fill the white background inward
// from the image edges and make only that transparent, so white labels or
// parts *inside* the product stay solid and products can overlap cleanly.
const cutout = async (buf, box) => {
  const trimmed = await sharp(buf)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 18 })
    .resize({ width: box, height: box, fit: "inside" })
    // White margin so the fill can flow all the way around the product.
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = trimmed;
  const { width: W, height: H } = info;
  // Near-white: bright and nearly grey (JPEG noise / soft studio gradients).
  const near = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.min(r, g, b) > 240 && Math.max(r, g, b) - Math.min(r, g, b) < 12;
  };
  const bg = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !near(p * 3)) continue;
    bg[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    rgba[p * 4] = data[p * 3];
    rgba[p * 4 + 1] = data[p * 3 + 1];
    rgba[p * 4 + 2] = data[p * 3 + 2];
    rgba[p * 4 + 3] = bg[p] ? 0 : 255;
  }
  // Slight feather: 3×3 average of the mask, so edges have no jaggies.
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) mask[p] = bg[p] ? 0 : 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          sum += mask[yy * W + xx];
          n++;
        }
      }
      rgba[(y * W + x) * 4 + 3] = Math.round(sum / n);
    }
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
};

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
  // Two products (promo tiles): side by side with only a slight overlap.
  const pairSlots = [
    { x: 0.73, y: 0.47, s: 0.62 },
    { x: 0.40, y: 0.67, s: 0.46 },
  ];
  const slots = wide && products.length === 2
    ? pairSlots
    : wide
    ? [
        { x: 0.71, y: 0.47, s: 0.84 },
        { x: 0.55, y: 0.58, s: 0.58 },
        { x: 0.87, y: 0.60, s: 0.54 },
      ]
    : w / h > 1.2
      ? [
          { x: 0.73, y: 0.50, s: 0.60 },
          { x: 0.40, y: 0.68, s: 0.50 },
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
    // Soft contact shadow so the product sits on a surface.
    const sw = Math.round(meta.width * 0.9);
    const sh = Math.max(12, Math.round(meta.height * 0.10));
    const blur = Math.max(6, Math.round(sh * 0.6));
    const pad = blur * 3;
    const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw + pad * 2}" height="${sh + pad * 2}"><ellipse cx="${sw / 2 + pad}" cy="${sh / 2 + pad}" rx="${sw / 2}" ry="${sh / 2}" fill="#0B3B35" fill-opacity="0.32"/></svg>`))
      .blur(blur)
      .png()
      .toBuffer();
    const sLeft = Math.max(0, Math.min(w - (sw + pad * 2), left + Math.round((meta.width - sw) / 2) - pad));
    const sTop = Math.max(0, Math.min(h - (sh + pad * 2), top + meta.height - Math.round(sh * 0.55) - pad));
    layers.push({ input: shadow, left: sLeft, top: sTop, blend: "multiply" });
    layers.push({ input: img, left, top });
  }
  return sharp(background(w, h)).composite(layers).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
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
