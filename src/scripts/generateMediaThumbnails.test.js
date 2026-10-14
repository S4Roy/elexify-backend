import { expect, it, vi } from "vitest";
import { createRequire } from "module";
import { runGenerateMediaThumbnails, thumbnailKeyFor } from "./generateMediaThumbnails.js";
vi.mock("../services/awsService/awsConfig.js", () => ({ s3Client: {}, cloudFrontClient: {} }));
vi.mock("../models/Media.js", () => ({ default: {} }));
const sharp = createRequire(import.meta.url)("sharp");
const logger = { info: vi.fn(), error: vi.fn() };

it("places thumbnails in a thumbs/ folder beside the image", () => {
  expect(thumbnailKeyFor("products/board 1.png")).toBe("products/thumbs/board 1.jpg");
  expect(thumbnailKeyFor("logo.webp")).toBe("thumbs/logo.jpg");
});

it("creates thumbnails for images without one and records them", async () => {
  const png = await sharp({ create: { width: 1600, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const rows = [{ _id: "m1", url: "products/a.png" }, { _id: "m2", url: "products/anim.gif" }];
  const MediaModel = { find: vi.fn(() => ({ lean: async () => rows })), updateOne: vi.fn() };
  const puts = [];
  const s3 = { send: vi.fn(async (cmd) => {
    if (cmd.constructor.name === "GetObjectCommand") return { Body: { transformToByteArray: async () => png } };
    puts.push(cmd.input);
    return {};
  }) };

  const dry = await runGenerateMediaThumbnails({ apply: false, s3, bucket: "b", MediaModel, logger });
  expect(dry.dryRunPreview.pending).toBe(1);
  expect(s3.send).not.toHaveBeenCalled();

  const { result } = await runGenerateMediaThumbnails({ apply: true, s3, bucket: "b", MediaModel, logger });
  expect(result).toMatchObject({ pending: 1, created: 1, failed: [] });
  expect(puts[0]).toMatchObject({ Key: "products/thumbs/a.jpg", ContentType: "image/jpeg", ACL: "public-read" });
  const meta = await sharp(puts[0].Body).metadata();
  expect([meta.format, meta.width, meta.hasAlpha]).toEqual(["jpeg", 400, false]);
  expect(MediaModel.updateOne).toHaveBeenCalledWith({ _id: "m1" }, { $set: { thumbnail: "products/thumbs/a.jpg" } });
});
