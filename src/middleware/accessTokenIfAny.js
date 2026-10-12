import { validateSession, validateLegacyToken } from '../services/customerSession/index.js';
import jwt from "jsonwebtoken";
import { envs } from "../config/index.js";
import { userService } from "../services/index.js";

// Tells the storefront and app that the token they sent no longer works, so
// they can clear the stale session. The request itself still succeeds as a
// guest — these routes don't require sign-in. Exposed to browsers via CORS.
export const SESSION_EXPIRED_HEADER = "X-Session-Expired";

/**
 * Middleware to optionally validate the Authorization header and decode user token
 * If no token is provided, it allows guest access via `x-guest-id`.
 */
export const accessTokenIfAny = async (req, res, next) => {
  // Always say whether the token was accepted. The app's HTTP cache (OkHttp)
  // merges a 304 into the response it stored earlier, so a "1" saved while
  // a token was expired would otherwise be replayed after the customer signs
  // in again — and the app would sign them straight back out. An explicit
  // "0" on every response overwrites it. Responses also vary by token.
  res.setHeader(SESSION_EXPIRED_HEADER, "0");
  res.vary("Authorization");
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;
  const guest_id = req.headers["x-guest-id"] || null;
  const stale = () => {
    res.setHeader(SESSION_EXPIRED_HEADER, "1");
    // Never cache a "your session expired" response.
    res.setHeader("Cache-Control", "no-store");
    // Never execute a customer's write as a guest and then replay it after refresh.
    if (req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.originalUrl?.includes('/auth/')) {
      return res.status(401).json({ status: 'error', code: 'ACCESS_TOKEN_EXPIRED', message: 'Please renew your session' });
    }
    asGuest();
    return next();
  };
  const asGuest = () => {
    if (guest_id) req.auth = { guest_id };
  };

  if (!token) {
    asGuest();
    return next();
  }

  let decodedData;
  try {
    decodedData = jwt.verify(token, envs.jwt.accessToken.secret, { algorithms: ["HS256"] });
  } catch (error) {
    // An expired session is routine (customer tokens last 7 days), so it's
    // not logged. Anything else — malformed or wrongly signed — is worth a
    // warning, without echoing the token.
    if (error?.name !== "TokenExpiredError") {
      console.warn("Optional auth: rejected token", {
        reason: error?.name || "Error",
        path: req.originalUrl?.split("?")[0],
      });
    }
    return stale();
  }

  try {
    if (!decodedData.sid && !decodedData.type) await validateLegacyToken(decodedData, token);
    if (decodedData.sid || decodedData.type) decodedData = await validateSession(decodedData, req);
    // A token for a deleted or blocked account falls back to guest access.
    if (
      decodedData?.user_id &&
      (decodedData.sid || !(await userService.isAccountClosed(decodedData.user_id, decodedData.iat)))
    ) {
      req.auth = {
        user_id: decodedData.user_id,
        sid: decodedData.sid,
        email: decodedData.email,
        role: decodedData.role,
        guest_id: guest_id,
      };
    } else {
      return stale();
    }
    next();
  } catch (error) {
    if (error.statusCode === 401) return stale();
    next(error);
  }
};
