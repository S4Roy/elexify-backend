import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { envs } from "../config/index.js";
import { userService } from "../services/index.js";
import { accessTokenIfAny } from "./accessTokenIfAny.js";

vi.mock("../services/customerSession/index.js", () => ({ validateLegacyToken: vi.fn(), validateSession: vi.fn() }));

vi.mock("../services/index.js", () => ({ userService: { isAccountClosed: vi.fn() } }));

const sign = (payload, options = {}) =>
  jwt.sign(payload, envs.jwt.accessToken.secret, { expiresIn: 3600, ...options });

const run = async (token, guest = "guest-1") => {
  const req = {
    originalUrl: "/api/v1/products?page=1",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(guest ? { "x-guest-id": guest } : {}) },
  };
  const res = { setHeader: vi.fn() };
  const next = vi.fn();
  await accessTokenIfAny(req, res, next);
  return { req, res, next };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  userService.isAccountClosed.mockResolvedValue(false);
});

describe("accessTokenIfAny", () => {
  it("serves a guest without flagging when no token is sent", async () => {
    const { req, res, next } = await run(null);
    expect(req.auth).toEqual({ guest_id: "guest-1" });
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("authenticates a valid token", async () => {
    const { req, res } = await run(sign({ user_id: "u1", email: "a@b.c", role: "customer" }));
    expect(req.auth).toMatchObject({ user_id: "u1", role: "customer", guest_id: "guest-1" });
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("flags an expired token, falls back to guest and doesn't log it", async () => {
    const { req, res, next } = await run(sign({ user_id: "u1" }, { expiresIn: -10 }));
    expect(req.auth).toEqual({ guest_id: "guest-1" });
    expect(res.setHeader).toHaveBeenCalledWith("X-Session-Expired", "1");
    expect(console.warn).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("flags a malformed token with a warning that omits the token", async () => {
    const { req, res } = await run("not-a-jwt");
    expect(req.auth).toEqual({ guest_id: "guest-1" });
    expect(res.setHeader).toHaveBeenCalledWith("X-Session-Expired", "1");
    expect(console.warn).toHaveBeenCalledWith("Optional auth: rejected token", {
      reason: "JsonWebTokenError",
      path: "/api/v1/products",
    });
  });

  it("flags a token for a closed account", async () => {
    userService.isAccountClosed.mockResolvedValue(true);
    const { req, res } = await run(sign({ user_id: "u1" }), null);
    expect(req.auth).toBeUndefined();
    expect(res.setHeader).toHaveBeenCalledWith("X-Session-Expired", "1");
  });
});

it('rejects an expired authenticated write before any guest mutation runs', async () => {
  const req = { method: 'POST', originalUrl: '/api/v1/site/inventory/product/cart-manage', headers: { authorization: `Bearer ${sign({ user_id: 'u1' }, { expiresIn: -10 })}`, 'x-guest-id': 'guest' } };
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await accessTokenIfAny(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
