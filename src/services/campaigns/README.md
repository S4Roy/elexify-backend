# Newsletter email campaigns

Admin page: `/email-campaigns`. API: `/api/v1/admin/email-campaigns` under `SERVER_BASEPATH`.

Workflow: create/save a draft, inspect the branded preview, send a test to a chosen mailbox, review the audience, then confirm immediate or scheduled sending. Draft revisions prevent lost edits. Confirmation is scoped to the draft revision and operator, expires after ten minutes, and is consumed atomically. Queued content is immutable. Cancellation stops remaining work; in-flight SMTP sends may still finish.

## Deployment

- Configure and enable the existing SMTP integration in admin Settings.
- Set `BACKEND_URL` to the public HTTPS backend origin, `SERVER_BASEPATH` to the optional deployment prefix, and `EMAIL_BRAND_COMPANY_ADDRESS` to the sender's postal address. Campaign preflight rejects missing identity/SMTP configuration or a non-HTTPS public unsubscribe URL. HTTP loopback URLs (`localhost`, `127.0.0.1`, `::1`) are allowed only in development/test. Test emails need SMTP but do not require a public backend URL or postal address because they carry no live unsubscribe link.
- Allow unauthenticated GET and POST access to `/api/v1/newsletter/unsubscribe/:token` (including the base prefix). This route intentionally bypasses API-key, login and reCAPTCHA middleware. Do not add a proxy authentication requirement. GET shows a confirmation form; POST handles browser and RFC 8058 one-click requests idempotently.
- The existing backend server runs the campaign worker every minute, processing up to ten recipients per tick. Mongo leases serialize each campaign across server instances. Unique campaign/subscriber and unsubscribe-token indexes are created before queuing; index failures stop campaign sends. Existing subscriber duplicate cleanup may be required before unique indexes can be built.
- Use the existing `subscribers.view` plus `customer.notification.view/create/send/schedule/cancel` permissions. Operators need view to open the screen; create to edit/test; send to queue; schedule for a future timestamp; cancel to stop sending. Existing RBAC action auditing records writes and the operator.
- Verify SPF, DKIM, DMARC alignment, SMTP limits and reputation with your email provider before production use. The application does not provision DNS records or sign DKIM independently of the configured SMTP service.

## Audience and results

Only `status: subscribed` with `deleted_at: null` is eligible. Source filtering is optional. Legacy statuses are excluded. New contacts after queue time are excluded, and eligibility is checked again immediately before each send. No admin path reactivates unsubscribed contacts. Unsubscribe updates newsletter status only, leaving transactional messages unaffected.

Each email has branded HTML, a plain-text alternative, a visible unsubscribe link, `List-Unsubscribe`, and `List-Unsubscribe-Post`. Unsubscribe tokens are random 256-bit values, hidden from subscriber resources and redacted in application access logs; redact them in proxy logs too.

The report distinguishes pending, sending, SMTP accepted, failed, skipped, and unknown. Accepted is not an inbox-delivery event. Explicit recipient rejection (550/551/553 with SMTP envelope failure) suppresses that subscriber. Timeouts and interrupted send claims become unknown and are never automatically resent. A campaign can complete with failed or unknown recipients; its report preserves those outcomes.

Provider webhook bounce/complaint ingestion and open/click analytics are not included. Monitor those in the SMTP provider and suppress affected contacts through subscriber management. Campaign bodies use an HTML allowlist; scripts, handlers, unsafe URLs and custom styling are removed. The visual editor provides basic headings, emphasis, lists, links and HTTPS images.

## Validation

Run `npm run test:campaigns`. For integration tests, provide `TEST_MONGODB_URI` pointing to an isolated local test database. The integration suite replaces the database name with `elexify_campaign_integration` and drops that test database afterward. SMTP delivery is mocked throughout integration tests. Do not point test configuration at a live database host.

## Sample drafts

Run `npm run seed:sample-campaigns`, or run **Seed Sample Email Campaigns** from admin Data Operations. Five drafts cover welcome, new collection, seasonal inspiration, product discovery, and a weekend newsletter. Each has a subject, preheader, content and storefront link. No discounts or product claims are invented. Samples are keyed uniquely, so reruns preserve edits, timestamps and sending state. These are standalone campaign drafts; the welcome sample is not an automatic signup flow.

## Email presentation and app footer

Campaign rendering adds inline typography, image sizing, and buttons for standalone HTTPS shopping links after sanitization. The shared email shell contains support, account, order, policy and copyright links; campaign consent and unsubscribe text stays in the footer. Saved drafts do not need reseeding.

App download links reuse Settings > App Updates visibility and validated store URLs through `websiteAppLinks()`. Disabled platforms are omitted. Settings are cached for up to one minute; a temporary settings lookup failure omits the optional app panel. The same footer is used for campaign, transactional and contact-reply emails, while unsubscribe remains campaign-only. Admin preview offers desktop and mobile sizes.

The shared footer uses configured HTTPS social profiles from Site Settings and raster app-store badges, arranged side by side on desktop and compact on mobile with wrapping badges. Assets live under storefront `public/email` and `public/badges`; deploy these alongside backend changes. Missing social profiles and disabled app platforms are omitted. Live newsletter emails show unsubscribe beside contact/privacy links; transactional templates show terms instead.

If the backend uses an internal HTTP URL behind an HTTPS proxy, set `CAMPAIGN_PUBLIC_BACKEND_URL` to the publicly reachable HTTPS backend origin for unsubscribe links. This overrides `BACKEND_URL` for campaigns only. Local development links are intended for local testing; use a public HTTPS URL for recipients outside the development machine.

Transactional template editing separates formatted message sections from protected dynamic partials/conditional blocks. Advanced source editing remains available. Switching modes preserves template logic and untouched content; editor initialization never rewrites source.
