# Customer authentication and admin session management

## Existing implementation reviewed

Password, OTP and Google login, signup, guest cart/wishlist merging, account editing/deletion, admin customer management, API-key guards, role/permission resolution, Axios clients and Zustand stores were inspected. Customer login previously issued only a long-lived JWT. Clients cleared their login on expiry. There was no refresh rotation, device session collection, or session-management API. Account status and some password-change paths checked account state; the customer profile password-change path did not invalidate previous credentials. The admin customer-delete handler incorrectly targeted Category; it now soft-deletes the customer and revokes credentials.

Existing response envelopes (`status`, `message`, `data`), login paths, `data.token.access_token`, user resources, guest cart/wishlist transfers, admin authentication and RBAC remain in use. Customer tokens now contain `sub`, `sid`, `type`, `iat`, `exp`; middleware maps them back to existing `req.auth.user_id` and role. Admin JWT generation is unchanged.

## Architecture and schema

Customer → CustomerSession → AuthEvent. See `src/models/CustomerSession.js` and `src/models/AuthEvent.js` for exact schemas and indexes. CustomerSession stores a SHA-256 hash of the signed, randomly identified refresh credential, never its plaintext. The JWT refresh credential has a dedicated audience/type, a random 256-bit identifier, and fixed absolute expiration. Device IDs are labels, never authorization credentials. A fresh server session is allocated for each login.

Access JWTs last 15 minutes. Browser access credentials live in memory; rotating refresh credentials use an HttpOnly, Secure-in-production, SameSite=Lax, host-only cookie. Native refresh credentials use Expo SecureStore. Browser refresh responses do not contain refresh credentials. Native transport explicitly sends `x-auth-client: native` without an Origin header; browser requests cannot use this to retrieve cookies as JSON.

Every authenticated customer request verifies session revocation, absolute/idle expiry, current customer status and the credential-change timestamp. This deliberately makes database validation authoritative for immediate revocation. Activity writes are throttled to once per 30 seconds. Both visible browser tabs and foreground mobile apps send a minute heartbeat; suspended/background clients become offline after the presence threshold without losing authentication.

Refresh checks the signed credential, then atomically replaces its stored hash using a MongoDB compare-and-swap. A valid signed credential with an old hash, including a concurrent losing refresh, revokes the session. No grace window accepts reused credentials. Browser requests share one refresh promise and use Web Locks across tabs; native requests share one refresh promise. Expired requests retry at most once. Temporary network/server failures preserve authentication. Logout and browser login transitions coordinate with refresh; cross-tab messages propagate logout/identity changes.

MongoDB TTL removes absolutely expired sessions and authentication events older than 90 days. An hourly job revokes idle sessions. Authorization checks expiry independently of both jobs. Last seen and active-device counts are aggregated for the current admin customer-list page rather than queried customer by customer.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| CUSTOMER_ACCESS_TOKEN_SECONDS | 900 | Positive, at most 900 seconds |
| REFRESH_TOKEN_EXPIRES_DAYS | 30 | Fixed absolute session lifetime, at most 90 days |
| SESSION_IDLE_TIMEOUT_DAYS | 7 | Session inactivity expiry, at most 90 days |
| CUSTOMER_ONLINE_THRESHOLD_SECONDS | 300 | Presence timeout, at most 3600 seconds |
| CUSTOMER_REFRESH_TOKEN_SECRET | access-token key fallback | Set an independent high-entropy signing secret in production |
| CUSTOMER_LEGACY_TOKEN_DEADLINE | unset | Optional ISO-8601 hard cutoff for accepting old customer JWTs |

`NODE_ENV=production` enables Secure cookies. Serve storefront/API over HTTPS on the same site (e.g. elexify.online/api.elexify.online). Cross-site preview domains need a same-site API/proxy; SameSite=Lax intentionally does not permit cross-site refresh cookies. CORS must explicitly allow the storefront origin and credentials. These settings are deployment configuration; the admin UI manages individual customer sessions, not global token lifetimes.

## APIs

Base prefix: `/api/v1`. Session paths work under both `/auth` and `/auth/user` to retain project naming. Native refresh/logout bodies use `{ "refresh_token": "..." }`; browser bodies omit the token and send cookies with credentials enabled. Session mutations require `x-session-request: 1`, preventing cross-site form requests. Protected endpoints require `Authorization: Bearer <access_token>`.

| Method/path | Behavior |
| --- | --- |
| POST /auth/user/login, /signup, /google, /verify-otp | Existing payloads, session issued on successful authentication |
| POST /auth/refresh | Rotate refresh credential, return `data.token` and `data.user` |
| POST /auth/migrate-session | Exchange a valid legacy customer JWT once; requires bearer JWT |
| POST /auth/logout | Revoke cookie/body/access-token session; repeated/missing-session logout succeeds |
| POST /auth/logout-all | Revoke all customer sessions and invalidate legacy tokens |
| GET /auth/sessions | Active devices, current-device flag, online status and last activity |
| DELETE /auth/sessions/:sessionId | Ownership-scoped revocation; clears cookie for current device |
| GET /auth/presence | Current customer's activity-based presence |
| GET /customers/me/presence | Presence alias using existing API-key/auth middleware |
| GET /admin/customers/:id/sessions?page=1 | 5 sessions/page with aggregate pagination metadata and global presence, requires `customer.view` |
| GET /admin/customers/:id/auth-events?page=1 | Latest 10 events/page with aggregate pagination metadata, requires `audit_log.view` |
| POST /admin/customers/:id/logout-all | Requires `customers.update` and `{ "reason": "At least 10 characters" }` |
| DELETE /admin/customers/:id/sessions/:sessionId | Same permission/reason, customer-scoped device revocation |

Example browser refresh response:

```json
{"status":"success","success":true,"message":"Success","data":{"token":{"access_token":"JWT","access_token_expiry":900,"session_id":"ObjectId"},"user":{"_id":"ObjectId"}}}
```

Example device response (`data` inside the standard success envelope):

```json
{"sessions":[{"id":"ObjectId","deviceName":"Browser","deviceType":"desktop","browser":"Chrome","os":"macOS","isCurrent":true,"createdAt":"ISO date","expiresAt":"ISO date","lastActivityAt":"ISO date"}],"online":true,"lastActivityAt":"ISO date"}
```

Authentication failures return HTTP 401 with `status:error`, `success:false`, `code` and `message`. Session error codes include `ACCESS_TOKEN_EXPIRED`, `INVALID_ACCESS_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REVOKED`, `SESSION_REVOKED`, `ACCOUNT_INACTIVE`, `TOKEN_REUSE_DETECTED`. Logout returns `{"status":"success","success":true,"message":"Logged out successfully"}`. Legacy business/validation errors retain their existing format.

Admin list responses use `mongoose-aggregate-paginate-v2`: `docs`, `totalDocs`, `limit`, `page`, `totalPages`, `hasPrevPage`, `hasNextPage`, `prevPage`, and `nextPage`. Customer session responses retain their existing `sessions` shape.

Admin UI: Customers → customer details → Customer sessions. View online/offline state, last seen and active devices; revoke one/all devices with an audit reason; users with audit permission can view recent security events. Customer storefront/mobile: Account → Security → Your devices.

## Migration and rollout

1. Release the backend and updated clients together. Existing native releases without refresh support will need an update to retain long sessions after their next login; old clients cannot understand the new renewal flow.
2. Create/verify CustomerSession indexes before enabling traffic, especially the sparse unique `legacyTokenHash` index. Use your normal deployment index process (`CustomerSession.createIndexes()`); do not use destructive index synchronization against production without reviewing differences.
3. Existing unexpired customer JWTs remain accepted for at most seven days from issuance, additionally bounded by their own JWT expiry and optional configured legacy deadline. Current storefront/native clients exchange them once. Consumed JWT hashes are recorded so the original token can no longer bypass session revocation. Browser exchange removes the old token from local/session storage.
4. Old JWTs have no device ID/session record; admins can invalidate these with logout-all, password change, deactivation or deletion. They cannot revoke an individual legacy device until exchange. No expired token is exchanged.
5. After the compatibility period set a legacy cutoff, review login failures/reuse events, and ensure cookies, trusted proxy configuration and CORS work on deployed domains. No refresh secrets belong in browser env variables.

## Security review and limits

- Refresh credentials are hashed at rest, sent only through cookies/native secure transport, and never recorded in authentication audit events. Access JWTs omit email/contact information.
- Logout-all, credential changes, deactivation and deletion enforce server-side invalidation. Reactivation does not restore revoked sessions.
- Session access/revocation matches customer ID and session ID together. Admin routes use existing database-backed permissions and record the acting admin.
- Cookie mutations require a non-simple custom header. JSON-only login rejects form login CSRF. Existing CORS rejects untrusted origins. SameSite and Secure provide additional browser protection.
- HttpOnly and memory storage reduce token exposure; XSS can still perform authenticated requests. Existing rendering/CSP controls remain necessary.
- Optional authenticated writes return 401 before executing as guests, so refreshing cannot duplicate a guest mutation. Responses belonging to a different login are not replayed under the new customer identity.
- Browser close, sleep and disconnect have no logout handlers. Presence and authentication have independent timeouts.
- Strict replay detection intentionally requires re-login if a rotated response is lost and the old refresh token is subsequently reused. Browsers lacking Web Locks have only same-tab refresh serialization and can require re-login during concurrent multi-tab rotation.
- Existing rate limiting is process-local. Multi-replica deployments need a shared rate-limit store or gateway limit. MongoDB rotation itself is coordinated across processes without Redis.
- New sessions are server-revoked immediately; an idle UI learns of revocation on its next request/foreground heartbeat, not by WebSocket push. No Socket.IO server exists, so none was introduced.

Rotation/replay design reference: [RFC 9700 section 4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14).

## Validation

Backend unit tests: `npx vitest run src/services/customerSession/session.test.js src/middleware/accessTokenIfAny.test.js src/config/corsOptions.test.js src/services/rbac/authorization.test.js`.

Database and HTTP integration: `TEST_MONGODB_URI=mongodb://127.0.0.1:27129/elexify_session_integration npx vitest run src/services/customerSession/session.integration.test.js`. Tests use the explicitly named isolated test database and clear only test collections. They cover real compare-and-swap rotation/reuse, multiple devices, ownership, logout, CSRF header, JWT expiry/signature, legacy exchange, admin deactivation/reactivation/deletion and presence. Without TEST_MONGODB_URI these tests are explicitly skipped.

Storefront: `npx tsc --noEmit --incremental false`; `node --test tests/customer-session.test.cjs tests/guest-login.test.cjs`. Refresh tests cover one request for concurrent callers, transient failure retention, rejected refresh clearing, logout ordering and memory-only access credentials.

Mobile: `npm run typecheck`; `npm test -- --runTestsByPath tests/client.test.ts tests/session.test.ts`. Admin template/type compilation: `npx ngc -p tsconfig.app.json --noEmit`.

Still validate in a deployed staging browser/device: Chrome/Safari cross-tab transitions, actual Secure cookie/CORS behavior, browser storage/cookie deletion, app reinstall, app suspension/laptop sleep, network handoff, and native SecureStore persistence. Automated tests simulate relevant state changes; they do not certify every browser/device lifecycle scenario or production infrastructure.

Final regression note: the stale CMS test expectations were updated to include the parser's existing `shortDescription` field, with coverage for mapping `short_description` from the API. The complete mobile suite passes: 99 tests across 21 suites. Authentication-specific tests and all three client type/template checks also pass.

## Customer directory filters

The admin customer list supports `presence=online|offline`, `active_sessions=yes|no`, `order_activity=none|one|repeat`, `has_email=yes|no`, and `has_mobile=yes|no`, combined with existing status, source, registration date, and verification filters. Filters run before aggregate pagination. Offline includes customers with no session activity; an active session can be offline. Order history counts all linked, non-deleted orders regardless of payment status, including legacy customer records as linked by user ID. Repeat means two or more orders. Session lookups exclude revoked, expired, and idle-expired sessions.
