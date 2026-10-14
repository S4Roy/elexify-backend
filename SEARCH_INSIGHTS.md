# Search Insights rollout

Deploy the backend first, then the web and mobile clients, then the admin panel. Existing product search routes, validation, matching and response shape are unchanged. The optional `search_event_id` route parameter is a random action UUID; clients never pass it into product API parameters or query cache keys.

## Event definitions

- `submitted`: Enter/Search/View all results. Creates a search action with unknown result count.
- `results_viewed`: a successful first-page result response (including a cached mobile result). Uses the backend response's full total and initial filter context. Updates the same action UUID once. Direct search-result URLs without an action UUID generate a results-view action.
- `suggestion_selected`: selecting a product from autocomplete. Independent of submitted search totals.
- `legacy`: existing first-page search API request logging, including typing fragments. Old rows without an event type are also legacy. They remain accessible without rewriting historical data.

An action counts once whether its submission or result event arrives first. A deliberate repeat submission creates a new UUID. Reloads, retries, filters, sorting and pagination do not add new submissions for an existing UUID. Confirmed zero results count only after successful result delivery; unresolved submissions have null counts and are excluded from the zero-result-rate denominator. Counts are reported by clients from existing product responses, not recomputed by an extra catalog query. Search results contain variation rows, so counts retain the existing catalog API's definition.

## Controls

All switches default to enabled for backward-compatible rollout:

- Backend `SEARCH_INSIGHTS_ENABLED=false`: disable new action ingestion independently of product search and legacy logging.
- Web `NEXT_PUBLIC_SEARCH_INSIGHTS_ENABLED=false`: disable client events (requires client rebuild).
- Mobile `EXPO_PUBLIC_SEARCH_INSIGHTS_ENABLED=false`: disable client events (requires client rebuild).
- Backend `SEARCH_INSIGHTS_LEGACY_REQUESTS_ENABLED=false`: stop additional legacy request logging after the desired client rollout. Historical legacy records remain readable. Older mobile clients will otherwise continue appearing only in the legacy view.

- Backend `SEARCH_FLEXIBLE_SEPARATORS=false`: match spaces, hyphens and underscores in product search literally again. By default they are interchangeable or optional between words ("e cycle" also finds "e-cycle" and "ecycle"); this only ever adds matches.

Ingestion is rate-limited independently of product search. Clients use a separate anonymous Axios transport without customer/session headers, session interceptors or error toasts, and with cross-origin credentials disabled. They retry transient failures once using the same UUID, swallow failures, and never await analytics before navigating. There is no durable offline queue; some events can be lost when a client closes or is offline.

## Database and verification

The `search_events` model adds an event-type index and a unique sparse `event_id` index. Existing rows have no UUID and do not conflict. `saveAction` awaits model initialization before writes. Automatic index creation must remain enabled, or deployment must provision these indexes before enabling events. The existing 90-day TTL remains. No customer, device, session or IP identifiers are added.

The admin defaults to action-based searches, with separate suggestion and legacy views, platform/scope filters, confirmed no-result rate and unknown counts. First-recorded date refers to the current selection, not a reconstructed historical rollout date.

Run unit tests with `npm test -- src/services/searchInsights src/controllers/admin/operations/searchInsights.test.js`. Run real MongoDB coverage with `SEARCH_INSIGHTS_TEST_MONGODB_URI=mongodb://127.0.0.1:27961/elexify_search_insights_test_actions npm test -- src/services/searchInsights/searchInsights.integration.test.js`. Only use the named isolated test database prefix; the integration suite drops that database after testing.

## Search synonyms

Admins manage whole-query synonyms at Search Insights → Synonyms (`search_synonyms` collection, unique `term` index). When a shopper's normalized search equals a term, product search also matches each alternative. Each backend instance caches synonyms for up to 60 seconds; a failed lookup falls back to the original query. Viewing needs `operations.view`; changes need `operations.update` and are audited.
