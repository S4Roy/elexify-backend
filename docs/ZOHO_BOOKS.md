# Zoho Books integration

## Deployment and activation

Automatic synchronization is disabled by default. Deploy the backend and admin
panel together. The new flow uses MongoDB, not Redis, and requires the existing
replica-set transaction support used by package creation. Use Node.js 20+.

1. Configure `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` using the existing credential
   encryption mechanism. Keep this key in your secret manager; back it up separately
   from the database. Do not rotate it without re-encrypting stored credentials.
2. Register a server-based OAuth client in your Zoho data center. Set
   `ZOHO_REDIRECT_URI` to the exact HTTPS admin URL, for example
   `https://admin.example.com/settings/integrations/zoho-books`. This is a browser
   callback: the authenticated admin sends the code/state to the backend by POST.
   Configure the admin web server for SPA fallback. Apply a `Referrer-Policy:
   no-referrer` header and avoid third-party analytics on the callback page.
3. Store `client_id` and `client_secret` in Settings → Integration Credentials →
   Zoho Books, or use `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`. Enable that managed
   credential provider. The new flow obtains its own encrypted refresh token;
   it does not consume the legacy manually entered refresh token.
4. Open Settings → Zoho Books and connect. Connection creates the required indexes
   on the six new `zoho_*` collections. The database identity must be permitted to
   create collections/indexes. Do not bypass index creation in deployment.
5. Select the organization. Existing legacy contact/invoice mappings require the
   original organization. Once selected, changing organization or data center
   requires a reviewed migration, not a settings edit.
6. Configure actual Zoho tax/tax-group IDs. JSON keys are `intra:18`, `inter:18`,
   `intra:0`, etc.; `cod:0` is required for a separate COD fee. Use the accounting
   metadata form for product HSN/SAC, unit, item tax ID, customer GSTIN/treatment.
7. Validate a small set of products, customers and packed orders in a separate
   Zoho test organization before enabling production synchronization. Enable the
   checkbox only after tax and total reconciliation has been verified.

Requested scopes cover settings read/create/update (Items and taxes), contacts
read/create/update, Sales Orders read/create/update, and invoice read/create for
compatibility with the existing manual invoice feature. Tokens are encrypted
with AES-256-GCM and excluded from normal Mongoose selections/API responses.
OAuth state is hashed, single-use, expires in ten minutes and is bound to the
initiating authenticated administrator. Outbound domains are allowlisted.

## Source of truth and fulfillment

- The local `Order` and `OrderItem` snapshots own commercial amounts. Zoho never
  writes back to inventory, payment, packing or shipment state.
- One Sales Order represents the entire customer order. Its `reference_number`
  is `Order.id`; its internal mapping identity is the immutable Mongo order ID.
  Package references appear in notes. No per-package Sales Orders are created.
- The first committed package PACKED event records `Order.zoho.packed_at` and
  increments `zoho.version` in the same packing transaction. This embedded
  outbox contains no network work or dependency on the Zoho configuration.
- Manual PACKED transitions also persist the marker in the order update.
  Package recomputation covers retries and linked external packages observed
  as PACKED. Historical imports that skip directly to shipped/delivered do not
  fabricate a PACKED event and are not silently exported.
- The minute worker finds unprocessed versions, upserts jobs and synchronizes
  contact → items → Sales Order. Shiprocket continues immediately after the local
  packing commit; **remote Zoho completion is not a shipping prerequisite**.
- Only packing events on or after first activation are automatically picked up.
  Earlier orders with a recorded PACKED event require explicit manual sync.
  Disabling/re-enabling pauses/resumes without changing that activation cutoff.

## Financial rules

Line prices, quantities, coupons and taxes come from order snapshots. Current
catalog prices are used only for catalog item synchronization. Snapshot shipping
already participates in GST, so the payload removes it from product lines and
represents it as separately taxed shipping lines, without adding it again as an
order-level charge. Product sale/tier discounts are already reflected in actual
selling rates; the allocated coupon is a separate line discount.

The worker validates snapshot arithmetic, organization currency, tax mapping
percentage/components, remote total and remote tax total. Unknown or inconsistent
historical financials, zero-total legacy snapshots, changed historical SKUs and
unsupported currencies fail visibly; they are not reconstructed from today's
prices or silently assigned zero tax. Customer order address snapshots are applied
to the Sales Order after creation. An address-update failure keeps the job unsynced
and retains the existing remote Sales Order ID for recovery.

This release exports only the organization's configured currency. Multi-currency
currency-ID/exchange-rate mapping is intentionally not guessed. Existing remote
invoices, closed/invoiced Sales Orders, cancellation, returns and refunds require
accounting review. The worker does **not** automatically issue invoices, credit
notes, payments or refunds. Existing manual invoice endpoints remain available;
once configured they use the new connection and shared contact mapping.

## Reliability and operations

- Unique local indexes enforce organization/kind/identity mappings and
  organization/kind/entity jobs. Contact aliases may share a remote contact ID.
- Mongo leases serialize workers, token refresh and mapping operations. Mapping
  and worker leases renew; job revisions fence stale completion writes.
- Before an external create, the mapping is durably marked `creating`. Recovery
  always searches paginated remote records with exact identifier comparison.
  Multiple matches stop for review.
- A timeout/5xx/crash after create can be an acknowledged-or-not remote write.
  **Never clear its `creating` marker just to retry.** Retry searches for the remote
  record; if still absent, the job stays in review instead of risking a second POST.
  An operator must reconcile the remote account before any corrective migration.
  This deliberately favors duplicate prevention over automatic progress. External
  actors creating records independently are outside the local lock boundary.
- Rate slots are shared across application replicas (750 ms between requests).
  Rate-limit responses pause organization work; retries honor `Retry-After` and use
  exponential backoff with jitter, capped at eight attempts before dead-lettering.
- Product/customer mappings are periodically inspected for relevant source
  changes in batches of 50; changes enqueue an update without relying on optional
  local `updated_at` fields. New catalog entities remain manual/on-demand.
- Settings shows connection, last success, job counts, paginated failures, manual
  bulk sync (up to 100 local IDs), retry and redacted logs. Order details shows the
  Sales Order ID/number and sync controls separately from the existing invoice card.
- Logs contain IDs/status/error codes, not tokens, raw requests or customer PII.
  Log retention is 90 days. Mapping records are not expired.
- Disconnect pauses locally before revoking the refresh token. If revocation fails,
  the encrypted revocation token is retained and the UI offers a retry. Reconnecting
  is blocked until revocation completes. Existing mappings/jobs are retained.
- Superadmin configures credentials/organization; superadmin and manager can view
  and synchronize via `zoho_sync.view` / `zoho_sync.manage`. Normal admin middleware
  and API-key/access-token checks still apply.

## Validation and rollout checklist

Run focused unit/regression tests:

```sh
npx vitest run src/services/zoho src/services/orderService/packages \
  src/services/orderService/derivePackageOrderStatus.test.js \
  src/services/orderService/historicalDelivery.test.js \
  src/constants/orderStatus.test.js \
  src/controllers/site/webhook/updateOrderStatus.test.js
```

Before production activation, exercise real Mongo replica-set concurrency and a
non-production Zoho organization: concurrent packing, multiple packages, token
expiry/revocation, 429, successful create followed by local write failure, worker
termination/restart, cancelled orders, GST intra/interstate, shipping/coupon/COD
rounding and invoice coexistence. Unit mocks cannot certify provider/account-specific
behavior. Monitor review/dead-letter counts and oldest queued job age.

Rollback: disable synchronization in settings first. Keep mapping/outbox records
and the encryption key; do not delete remote accounting records or reset mapping
states. Existing payment, inventory and Shiprocket processing remain independent.

## Provider references

- https://www.zoho.com/books/api/v3/oauth/
- https://www.zoho.com/books/api/v3/items/
- https://www.zoho.com/books/api/v3/contacts/
- https://www.zoho.com/books/api/v3/sales-order/
- https://www.zoho.com/books/api/v3/taxes/
