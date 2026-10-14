import { beforeEach, expect, it, vi } from "vitest";
import { createRequire } from "module";
import { BACKUP_PREFIX, CACHE_CONTROL, invalidationPaths, restoreOriginals, runOptimizeMediaImages } from "./optimizeMediaImages.js";
vi.mock("../services/awsService/awsConfig.js", () => ({ s3Client: {}, cloudFrontClient: {} }));
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const logger = { info: vi.fn(), error: vi.fn(), logs: [] };
const photo = async () => {
  const data = Buffer.alloc(3000 * 2000 * 3);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  return sharp(data, { raw: { width: 3000, height: 2000, channels: 3 } }).png().toBuffer();
};

// In-memory S3 that understands the commands the script sends.
function fakeS3(objects) {
  const store = new Map(Object.entries(objects));
  const writes = [];
  const send = vi.fn(async (command) => {
    const input = command.input;
    const name = command.constructor.name;
    const fromSource = () => decodeURIComponent(input.CopySource.split("/").slice(1).join("/"));
    if (name === "ListObjectsV2Command") {
      const keys = [...store.keys()].filter((key) => !input.Prefix || key.startsWith(input.Prefix));
      return { Contents: keys.map((Key) => ({ Key, Size: store.get(Key).body.length })), IsTruncated: false };
    }
    if (name === "HeadObjectCommand") {
      const object = store.get(input.Key);
      if (!object) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
      return { ContentType: object.type, CacheControl: object.cache, Metadata: object.meta ?? {} };
    }
    if (name === "GetObjectCommand") return { Body: { transformToByteArray: async () => store.get(input.Key).body } };
    if (name === "PutObjectCommand") {
      writes.push(["put", input.Key]);
      store.set(input.Key, { body: input.Body, type: input.ContentType, cache: input.CacheControl, meta: input.Metadata });
      return {};
    }
    if (name === "CopyObjectCommand") {
      writes.push(["copy", input.Key]);
      const source = store.get(fromSource());
      const replace = input.MetadataDirective === "REPLACE";
      store.set(input.Key, replace
        ? { body: source.body, type: input.ContentType, cache: input.CacheControl, meta: input.Metadata }
        : { ...source });
      return {};
    }
    throw new Error(`Unexpected ${name}`);
  });
  return { send, store, writes };
}

let big;
beforeEach(async () => {
  vi.clearAllMocks();
  big ??= await photo();
});

it("dry run reports candidates and writes nothing", async () => {
  const s3 = fakeS3({ "products/big photo.png": { body: big, type: "image/png" } });
  const { dryRunPreview } = await runOptimizeMediaImages({ apply: false, s3, bucket: "b", invalidate: vi.fn(), logger });
  expect(dryRunPreview).toMatchObject({ scanned: 1, candidates: 1, bytes_before: big.length });
  expect(dryRunPreview.estimated_bytes_after).toBeLessThan(big.length);
  expect(s3.writes).toEqual([]);
});

it("backs up before overwriting, keeps the key, and invalidates by folder", async () => {
  const small = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  const s3 = fakeS3({
    "products/big photo.png": { body: big, type: "image/png" },
    "banners/tiny.jpg": { body: small, type: "image/jpeg" },
    "docs/readme.txt": { body: Buffer.from("x"), type: "text/plain" },
  });
  const invalidate = vi.fn();
  const { result } = await runOptimizeMediaImages({ apply: true, s3, bucket: "b", invalidate, logger });

  const bigWrites = s3.writes.filter(([, key]) => key.endsWith("big photo.png"));
  expect(bigWrites).toEqual([["copy", `${BACKUP_PREFIX}products/big photo.png`], ["put", "products/big photo.png"]]);
  expect(s3.store.get(`${BACKUP_PREFIX}products/big photo.png`).body).toBe(big);
  const optimized = s3.store.get("products/big photo.png");
  expect(optimized).toMatchObject({ type: "image/jpeg", cache: CACHE_CONTROL, meta: { optimized: "1" } });
  expect((await sharp(optimized.body).metadata()).width).toBe(1600);
  // Small image only gains the cache header.
  expect(s3.store.get("banners/tiny.jpg")).toMatchObject({ body: small, cache: CACHE_CONTROL, type: "image/jpeg" });
  expect(s3.store.has(`${BACKUP_PREFIX}docs/readme.txt`)).toBe(false);
  expect(invalidate).toHaveBeenCalledWith(expect.arrayContaining(["products/*", "banners/*"]));
  expect(result).toMatchObject({ scanned: 2, processed: 2, failed: [] });
});

it("skips processed objects and backups on a second run", async () => {
  const s3 = fakeS3({ "products/a.jpg": { body: big, type: "image/png" } });
  await runOptimizeMediaImages({ apply: true, s3, bucket: "b", invalidate: vi.fn(), logger });
  s3.writes.length = 0;
  const invalidate = vi.fn();
  const { result } = await runOptimizeMediaImages({ apply: true, s3, bucket: "b", invalidate, logger });
  expect(result).toMatchObject({ scanned: 1, processed: 0 });
  expect(s3.writes).toEqual([]);
  expect(invalidate).not.toHaveBeenCalled();
});

it("restores originals from the backup prefix", async () => {
  const s3 = fakeS3({ "products/a.png": { body: big, type: "image/png" } });
  await runOptimizeMediaImages({ apply: true, s3, bucket: "b", invalidate: vi.fn(), logger });
  const invalidate = vi.fn();
  expect(await restoreOriginals({ target: "products/", s3, bucket: "b", invalidate, logger })).toEqual(["products/a.png"]);
  expect(s3.store.get("products/a.png")).toMatchObject({ body: big, type: "image/png" });
  expect(invalidate).toHaveBeenCalledWith(["products/*"]);
});

it("builds one wildcard per top-level folder", () => {
  expect(invalidationPaths(["products/a.jpg", "products/x/b.jpg", "logo.png"])).toEqual(["products/*", "logo.png"]);
});
