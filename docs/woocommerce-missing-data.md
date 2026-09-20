# WooCommerce missing-data import

Admin panel: Settings → Data Operations → Import WooCommerce Data.

1. Make the uncompressed backup available at `db-backups/eqstoxco_wp434.sql` on the backend server. This folder is ignored by Git; deployment does not copy the backup automatically.
2. Back up MongoDB and test using a staging copy first. The importer requires a replica set (or mongos) for atomic order/item transactions. Audits also work on standalone MongoDB.
3. Click **Audit Missing Data**. Review missing/existing/blocked counts and issues. The UI shows at most 100 issue examples and aggregate reason counts in logs; it never returns customer details.
4. Click **Import Missing Records** and complete the existing confirmation dialog. Only eligible missing records are created. A successful matching audit from the last hour is required on the server, including for CLI callers.
5. Read the execution log. After a partial run or a source/target change, audit again before retrying.

The importer reads the SQL as data; it never executes SQL or connects to MySQL. It accepts this source's phpMyAdmin INSERT syntax, `wpgh_` prefix and explicitly disabled HPOS setting. Other exports fail closed. The source identity is fixed to this old store, so replacing the file must mean a newer export of the same store.

Customer matches use unambiguous normalized email; staff and deleted accounts are blocked. Only WordPress customer-role accounts are considered. Passwords and account verification are not copied. Original customer address/contact metadata is retained in `User.legacy_import.addresses` for reconciliation; it is not published as editable saved addresses or a verified phone. Order billing/shipping snapshots retain historical address/contact details. Guest orders remain guests. Guest reviews are blocked rather than assigned to another user.

Products and variations require exact, unique SKU matches. Order numbers already present are never updated; matching migrated orders are skipped and other collisions are reported. Existing incomplete orders need a separate repair workflow. Source IDs generate deterministic Mongo IDs, and database unique constraints are retained. Order writes and their items are transactional. A concurrent conflict stops the run; completed groups remain committed and are reported as partial progress.

Supported order imports use INR with COD or Razorpay and reconciled totals. Foreign currencies without historical exchange rates, refunds, unsupported custom statuses, fees, and unresolved references are blocked. Review lengths, ratings and moderation states must fit the current schema. No automatic email, payment, stock, shipping or accounting service is called. Existing records are not overwritten.

Audit and import use the existing synchronous data-operations runner and its permission checks, execution logs and lock. Allow sufficient reverse-proxy request time for large imports. If a browser request times out, check execution history before retrying. This feature does not change the configured MongoDB connection: run the backend against staging when testing.

Tests: `npm test -- src/services/legacyImport/legacyImport.test.js`.

## Finding imported records

On Customers, Orders, or Ratings & Reviews, open Filters → Import source → WooCommerce backup import. Matching rows carry an Imported badge. Other records excludes this particular backup import; it can include older webhook migrations, so it does not mean only newly created storefront records. Filters apply before pagination and combine with the other list filters.

Customers and orders from the initial run already have source metadata. Future review imports now include it too. To recognize reviews from the initial version, the backend derives their exact deterministic MongoDB IDs from the original SQL backup. This read-only lookup is cached and retains only review IDs. Keep the backup available on the server for this compatibility lookup; no reimport or database updates are needed.
