import { describe, expect, it } from "vitest";
import { validateMediaUpload } from "./validateMediaUpload.js";

describe("validateMediaUpload", () => {
  it("rejects SVG active content regardless of declared MIME", async () => {
    const data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(validateMediaUpload({ data, size: data.length, mimetype: "image/svg+xml" }))
      .rejects.toThrow("not a supported image or video");
  });

  it("rejects executable content declared as an image", async () => {
    const data = Buffer.from("#!/bin/sh\necho unsafe");
    await expect(validateMediaUpload({ data, size: data.length, mimetype: "image/png" }))
      .rejects.toThrow("not a supported image or video");
  });

  it("rejects an oversized file before decoding", async () => {
    const data = Buffer.concat([Buffer.from("ffd8ff", "hex"), Buffer.alloc(9)]);
    await expect(validateMediaUpload({ data, size: 9 * 1024 * 1024, mimetype: "image/jpeg" }))
      .rejects.toThrow("8MB");
  });
});
