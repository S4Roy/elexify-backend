# reCAPTCHA v3 rollout

Protection is **disabled by default**. No Google credentials are seeded and no live settings were changed. This rollout covers the web storefront. Mobile uses the same APIs and has no header-based bypass: keep enforcement off until those clients can submit valid verification tokens or their supported access paths have a separate verified policy.

## Admin setup

Use Settings → Integration credentials → reCAPTCHA v3. Save a v3 site key and secret, exact comma-separated hostnames (no scheme, port, path or wildcard), per-form switches, mode, score threshold (default 0.5), and checkout attempt threshold (default 5). The existing superadmin permission, AES-GCM encryption, write-only secret fields, and credential-change audit apply. No environment fallback is used for reCAPTCHA. Removing its settings disables protection.

Deploy the backend, storefront and admin updates before enabling. Ensure the `abuse_windows` expiry index has been created by the normal Mongoose index provisioning process. Validate configuration checks format only; it cannot prove that a key pair works. Test actual submissions using domain-registered keys in monitor mode, review Google’s action scores and `recaptcha_verification` operational events, then enable enforcement deliberately. Leave the Google badge visible. If adding a CSP, allow the required Google reCAPTCHA script/frame/connect resources per Google’s documentation.

## Coverage

- Login includes password login, Google sign-in and OTP send/verify.
- Registration, password-reset request and reset submission.
- Contact form and product enquiry, authenticated review submission, newsletter signup.
- Checkout order placement and payment retry only when repeated attempts reach the configured threshold. Payment verification and webhooks are not challenged.
- Admin login is unchanged so administrators can recover configuration errors.

The checkout risk signal is a fixed ten-minute attempt window, shared through MongoDB, per IP and verified user. Guest IDs, Origin, User-Agent and client flags never exempt a request. Counters contain HMAC-hashed identities, expire automatically, and continue incrementing after verification. Keep the API behind its trusted proxy and prevent direct access that could spoof forwarded IPs. This velocity signal complements existing rate limits and payment controls; it is not a complete fraud detection system.

## Verification and failure handling

The storefront fetches public settings and executes a fresh action-specific token at submit time. The backend independently decides whether verification is required, then verifies with Google using a five-second timeout. It checks success, exact action, exact hostname, numeric score and a maximum two-minute age. Google rejects previously verified tokens. Tokens and secrets are not included in audit events or URLs.

In monitor mode verification failures are recorded without denying the request. Browser script failures are also tolerated in monitor mode. Suspicious checkout attempts without tokens are recorded rather than challenged in this mode. In enforce mode, absent/invalid/low-score tokens fail before business side effects; Google outages return 503. Configuration or counter-store failures return 503 rather than silently disabling protection.

Ordinary checkout does not load Google. Suspicious checkout in enforce mode returns `RECAPTCHA_REQUIRED` before creating any order/payment; the client gets a fresh token and resubmits once with the original payload and idempotency key. Other errors are never automatically retried as checkout challenges.

No raw IP, form fields, tokens or secret values are stored in verification operational events. Events aggregate failures by action, mode and reason, including the latest score where available. Google’s console provides the overall score distribution. The public settings endpoint exposes only enabled state, mode, site key and protected action names.

References: https://developers.google.com/recaptcha/docs/v3 and https://developers.google.com/recaptcha/docs/verify
