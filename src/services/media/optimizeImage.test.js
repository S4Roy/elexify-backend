import { expect, it } from "vitest";
import { createRequire } from "module";
import { extensionFor, makeThumbnail, optimizeImage } from "./optimizeImage.js";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

// Noise makes fixtures behave like camera photos (they don't compress to nothing).
const noisy = (width, height, channels) => {
  const data = Buffer.alloc(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  return sharp(data, { raw: { width, height, channels } });
};

it("shrinks a large photo to 1600px JPEG", async () => {
  const input = await noisy(4000, 3000, 3).png().toBuffer();
  const out = await optimizeImage(input, "image/png");
  expect(out.changed).toBe(true);
  expect(out.contentType).toBe("image/jpeg");
  expect(out.buffer.length).toBeLessThan(input.length);
  const meta = await sharp(out.buffer).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1600, 1200]);
});

it("keeps transparency as PNG", async () => {
  const input = await noisy(2400, 1200, 4).png().toBuffer();
  const out = await optimizeImage(input, "image/png");
  expect(out.contentType).toBe("image/png");
  const meta = await sharp(out.buffer).metadata();
  expect([meta.format, meta.hasAlpha, meta.width]).toEqual(["png", true, 1600]);
});

it("returns GIF, SVG, video and unreadable data untouched", async () => {
  const gif = await noisy(50, 50, 3).gif().toBuffer();
  for (const [buffer, type] of [[gif, "image/gif"], [Buffer.from("<svg/>"), "image/svg+xml"], [Buffer.from("x"), "video/mp4"], [Buffer.from("not an image"), "image/jpeg"]]) {
    const out = await optimizeImage(buffer, type);
    expect(out).toEqual({ buffer, contentType: type, changed: false });
  }
});

it("keeps small images that would not shrink", async () => {
  const input = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } }).jpeg({ quality: 60 }).toBuffer();
  const out = await optimizeImage(input, "image/jpeg");
  expect(out.changed).toBe(false);
  expect(out.buffer).toBe(input);
});

it("applies EXIF orientation", async () => {
  const input = await noisy(3000, 2000, 3).jpeg({ quality: 100 }).withMetadata({ orientation: 6 }).toBuffer();
  const out = await optimizeImage(input, "image/jpeg");
  const meta = await sharp(out.buffer).metadata();
  expect([meta.width, meta.height]).toEqual([1067, 1600]);
});

it("makes a 400px JPEG thumbnail and maps extensions", async () => {
  const thumb = await makeThumbnail(await noisy(2000, 1000, 4).png().toBuffer());
  const meta = await sharp(thumb).metadata();
  expect([meta.format, meta.width, meta.hasAlpha]).toEqual(["jpeg", 400, false]);
  expect([extensionFor("image/jpeg"), extensionFor("image/png"), extensionFor("image/gif")]).toEqual([".jpg", ".png", null]);
});
