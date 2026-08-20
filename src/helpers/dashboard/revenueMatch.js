/**
 * What counts as "revenue" across every dashboard endpoint (trend,
 * performance, leaderboard, geo stats).
 *
 * RudrakshaValley's reference implementation gates revenue on
 * `payment_status === "paid"`. That doesn't hold for Elexify's actual order
 * history: as of writing, 9,847 of 9,849 orders have payment_status
 * "pending" — including 3,418 already "delivered" — because payment_status
 * was never reliably tracked for this store (COD-heavy, plus migrated
 * historical data). Gating on it would show ~₹0 revenue everywhere despite
 * thousands of real completed orders.
 *
 * order_status is the reliable signal instead: count everything except
 * orders that are cancelled, failed, or in some stage of being returned —
 * i.e. orders where no revenue was actually realized.
 */
export const EXCLUDED_REVENUE_STATUSES = [
  "cancelled",
  "failed",
  "return-initiated",
  "return-in-transit",
  "order-returned",
  "undelivered",
];

export const revenueStatusMatch = {
  order_status: { $nin: EXCLUDED_REVENUE_STATUSES },
};

/** Aggregation-pipeline-friendly $cond for a conditional $sum. */
export const revenueSumExpr = (amountField = "$grand_total") => ({
  $cond: [
    { $in: ["$order_status", EXCLUDED_REVENUE_STATUSES] },
    0,
    amountField,
  ],
});
