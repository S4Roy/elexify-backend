import { describe, expect, it, vi } from "vitest";
import { buildAllowedOrigins, buildCorsOptions } from "./corsOptions.js";

describe("buildAllowedOrigins", () => {
  it("drops empty/falsy entries and trims a trailing slash", () => {
    expect(
      buildAllowedOrigins("https://site.example/", "", null, "https://admin.example"),
    ).toEqual(["https://site.example", "https://admin.example"]);
  });
});

describe("buildCorsOptions", () => {
  const allowedOrigins = ["https://www.elexify.online", "https://elexify.baseweb.in"];
  const options = buildCorsOptions(allowedOrigins);

  it("allows a request with no Origin header (server-to-server, curl, mobile apps)", () => {
    const callback = vi.fn();
    options.origin(undefined, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("allows a known origin", () => {
    const callback = vi.fn();
    options.origin("https://www.elexify.online", callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("allows any localhost port (dev convenience)", () => {
    const callback = vi.fn();
    options.origin("http://localhost:4200", callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it("rejects an origin not on the allowlist with a 403, not a 500", () => {
    const callback = vi.fn();
    options.origin("https://evil.example", callback);
    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(callback.mock.calls[0][1]).toBeUndefined();
    expect(callback.mock.calls[0][0].statusCode).toBe(403);
  });
});
