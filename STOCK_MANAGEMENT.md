# Stock management

On-hand, reserved and available stock with a full movement ledger. Everything that changes stock goes through `src/services/stock`.

## Model

| Field (Product / ProductVariation) | Meaning |
|---|---|
| `stock_quantity` | On hand. Can go negative only when `allow_backorders` is on. |
| `reserved_quantity` | Units held for prepaid / Partial COD orders that are waiting for payment. |
| available | `stock_quantity − reserved_quantity`. Computed, not stored. This is what can still be sold. |
| `manage_stock` | `false` means stock is not tracked: unlimited, with no ledger rows. |
| `allow_backorders` | The SKU can be sold past zero. |
| `stock_status` | `in_stock`, `out_of_stock` or `on_backorder`. Re-derived on every change. A variable product's status rolls up from its variations. |
| `low_stock_threshold` | Per-SKU alert level. `null` uses the `low_stock_threshold` site setting. |

`StockTransaction` is the ledger of on-hand movements. Each row has a signed `delta`, `balance_after`, `reason`, `note`, `actor_type` and a unique `idempotency_key`. The invariant is `sum(delta) == stock_quantity`.

`StockReservation` records holds. They are not ledger rows.

`Order.stock_state` moves through these states:

| From | To | When |
|---|---|---|
| none | reserved | Prepaid order placed |
| reserved | committed | Payment captured |
| reserved | released | Hold expired, payment failed or order cancelled |
| none | committed | COD order, replacement or reopen |
| committed | restocked | Order cancelled |

The legacy fields `stock_reserved` and `inventory_reverted` are still written for compatibility.

## Flows

- **COD checkout.** Units are sold at placement, guarded on available stock.
- **Prepaid and Partial COD checkout.**
  - Units are reserved at placement, so two buyers can't both pay for the last unit.
  - The hold lasts `stock_reservation_ttl_minutes` (site setting, default 20). Keep it at least 15 minutes, the payment-failure window.
- **Capture.** `finalizeCapturedPayment` commits the hold.
- **Late capture.** If a capture arrives after the hold was released:
  - It sells from available stock if there is enough.
  - Otherwise the order is cancelled, flagged `stock_flag: "late_capture_oos"` and refunded through `attemptRefund`. If that refund fails, retry it from the order page.
- **Payment after cancellation.** A capture on an order that was already cancelled never revives it. The payment is recorded, the order is flagged `capture_after_cancel` and refunded, and the original cancellation details are kept.
- **Expiry.** The `releaseExpiredReservations` cron runs every minute. It asks Razorpay first and finalizes instead of releasing if the order turns out to be paid.
- **Payment retry.** `retryPayment` renews or re-acquires the hold. If the units are gone, the customer is told to place a new order.
- **Cancel.** The order is released or restocked in the same transaction as the status change.
- **Reopen.** A new `stock_epoch` is started, then the units are sold again.
- **Return QC.** Items with disposition `restock` go back on hand (`customer_return`).
- **Admin.** Product edit never writes stock. Changes go through `POST /admin/inventory/stock/adjust`:
  - `mode: "delta"` applies a signed change. `mode: "set"` sets a counted quantity.
  - A reason code is required.
  - `expected_on_hand` returns 409 if stock moved since the admin loaded it.
  - On-hand can never drop below reserved.
  - New SKUs book their starting quantity as an `opening_balance` row.
- **Customer-facing APIs.** Product list and details, wishlist and cart report `stock_quantity` as available units, so older app builds never offer reserved units. Admin APIs report on-hand plus `reserved_quantity` and `available_quantity`.

## Deploying

1. Deploy the backend and admin panel together. The new admin form no longer sends `manage_stock: false`.
2. Run `npm run data:run stock-ledger-foundation`, dry run first. It:
   - backfills the new fields;
   - books one opening balance per SKU;
   - builds the new ledger index, then drops the old `{reference_id, product, variation, type}` unique indexes;
   - backfills `Order.stock_state`.
   Until it has run, reopening a cancelled order can still hit the old duplicate-key index.
3. Run `npm run data:run fix-provider-attempt-index`. It replaces the sparse unique `provider_order_id` index on `provider_order_attempts`, which made two customers' simultaneous prepaid checkouts collide on `null`, with a partial index.
4. Run `stock-reconcile` as a dry run. It should report no drift. A real run resets `reserved_quantity` from active holds and books `count_correction` rows for on-hand drift. It never changes on-hand.

## Tests

```
TEST_MONGODB_URI='mongodb://127.0.0.1:27017/x?replicaSet=elexifyLocalRs' npx vitest run --no-file-parallelism \
  src/services/stock src/controllers/admin/inventory/stock
```

Each suite renames the database to its own `elexify_*_integration` name and drops it afterwards.
