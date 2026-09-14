# Return module

The existing `return_requests` model is the separate return record. Existing orders,
order items, payment clients, stock transactions, admin permissions and notification
jobs are reused. This enhancement does not re-create the original shipment or reset
the original order's delivery status.

## Setup

1. Use a MongoDB replica set (transactions are required).
2. Run `node src/scripts/migrateReturnIndexes.js` after deploying the backend. This
   removes only the legacy unique `order_id` return index, adds request/replacement
   indexes, and inserts the `return_updated` email template if missing. Existing
   returns and customized templates are preserved. Applied to the local database.
3. Set return availability, window, reasons and image requirements in existing
   Admin → Settings → Shipping Settings.
4. Keep the existing Shiprocket integration enabled. In the admin return's pickup
   panel enter its configured warehouse pickup-location name and actual parcel
   dimensions (cm) and weight (kg). `RETURN_WAREHOUSE` can supply the default name;
   otherwise the existing project pickup-location name is used. No warehouse or
   courier IDs are hardcoded.
5. Set a private `RETURN_WEBHOOK_TOKEN` in the backend environment and use the same
   security token in Shiprocket's webhook configuration for the existing
   `/api/v1/site/webhook/order/update-status` URL (include any configured base path).
   Shiprocket sends this token as `x-api-key`. Reverse events reject the public
   storefront API key. Forward webhook handling retains its previous support.
6. Provision/enable the existing transactional Email/SMS/WhatsApp provider templates
   for return events, including `return_updated`. The queue and delivery logs are
   reused. No live notifications are sent by the regression tests.

## Workflow

Customer: My Orders → Order Details → Return. Select eligible quantities, Refund
or Replacement, reason, optional images, and confirm. The browser supplies a stable
submission key for retries; the server locks the order in a transaction before
checking outstanding quantities. Rejected/cancelled requests release quantities;
received/QC-failed items stay consumed to prevent returning the same physical item again.

Admin: `/inventory/orders/returns`. Review with remarks (mandatory for rejection),
generate reverse pickup, monitor AWB/courier/tracking, receive, and perform QC.
Accepted quantity zero records QC failure. Accepted sellable quantities are restocked;
accepted damaged/quarantined items may be refunded but are not restocked. QC, stock
movement history and financial reservation commit in one transaction.

Refunds use net merchandise value after product/coupon discounts. Original shipping
and COD fees are excluded for new returns. Existing return financial snapshots retain
their recorded values. Integer minor-unit allocation preserves rounding across partial
returns. The sum of reserved/processed refunds cannot exceed the original order total;
Razorpay also checks the captured payment balance. A submitted refund is not marked
complete until the provider reports `processed`. COD/PayPal retain the existing manual
settlement workflow with an administrator-recorded reference.

Replacement creates one linked no-charge order after QC, atomically reserving stock.
It appears in the existing order list for normal fulfillment. Delivery updates complete
the return. If stock is unavailable, use the replacement retry action after replenishment.
The generated replacement order is not eligible for another automatic return; support
must review repeat replacement claims.

## Provider failures

Booking saves each provider reference before the next step. An uncertain timeout
never triggers another create automatically. Use Shiprocket's existing return order
ID to recover a create/AWB operation. If an AWB was already persisted when scheduling
became uncertain, refresh tracking or confirm the existing booking with the manual
pickup action instead of scheduling another pickup. Activity history records attempts.
A crashed worker's booking lock can be revisited after two minutes; pending provider
operations still require reconciliation.

Refund cron reconciliation reuses the stored refund ID. If a submission timed out
before that ID was saved, it looks up the payment's refund receipts instead of creating
another refund. If no matching receipt appears in the provider's latest 100 refunds,
operator investigation is required. Known provider failures remain visible for review;
there is intentionally no blind retry of a potentially successful financial request.

Carrier status strings are mapped in one return-specific module. Duplicate and stale
callbacks cannot move pickup backward or restock/refund inventory. Manual receipt and
QC still require admin permissions.

## Verification

- `npm test` — unit/regression suite; database suites require their explicit env vars.
- `RETURN_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/elexify_return_test_workflow?replicaSet=elexifyLocalRs' npm test -- src/services/returnService/workflow.integration.test.js`
  uses and drops only the dedicated `elexify_return_test_*` database.
- Storefront/admin: `npx playwright test e2e/return-module.spec.ts` with the existing
  Playwright server settings. These UI tests intercept API responses; they do not book
  couriers, send notifications or issue refunds.

Live Shiprocket bookings, real gateway refunds and real notification delivery still
require staging verification with configured accounts before production rollout.

Provider contracts: [Shiprocket return API](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/documentation/qu05zax/shiprocket-api?entity=request-8407119-81b2135b-d43c-4002-8f7f-a670aa5210fa),
[reverse AWB assignment](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/request/rbouga2/generate-awb-for-return-shipment),
[webhook security](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/collection/qu05zax/shiprocket-api).
