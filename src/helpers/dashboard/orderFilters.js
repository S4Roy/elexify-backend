/**
 * Dashboard segment filters shared by every dashboard endpoint (status
 * counts, performance, trend, leaderboards, geo stats), so a filtered view
 * means the same orders everywhere:
 *
 *   channel = storefront | admin          → Order.source
 *   payment = prepaid | cod | partial_cod → how the order is paid
 *
 * Unknown values are ignored (treated as "all") rather than rejected, so an
 * old bookmarked URL never breaks the dashboard.
 */
const CHANNELS = new Set(["storefront", "admin"]);

const PAYMENT_MATCH = {
  prepaid: { payment_method: "razorpay" },
  cod: { payment_method: "cod", is_partial_cod: { $ne: true } },
  partial_cod: { is_partial_cod: true },
};

export const orderSegmentMatch = (query = {}) => {
  const match = {};
  const channel = String(query.channel || "");
  if (CHANNELS.has(channel)) {
    // Orders created before `source` existed are storefront orders.
    match.source = channel === "storefront" ? { $in: ["storefront", null] } : "admin";
  }
  const payment = PAYMENT_MATCH[String(query.payment || "")];
  if (payment) Object.assign(match, payment);
  return match;
};

/**
 * Comparison window for period-over-period deltas:
 *   previous_period (default) — the equal-length window right before
 *   previous_year             — the same dates one year earlier
 */
export const getComparisonRange = (startDate, endDate, compare = "previous_period") => {
  if (compare === "previous_year") {
    const prevStart = new Date(startDate);
    prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1);
    const prevEnd = new Date(endDate);
    prevEnd.setUTCFullYear(prevEnd.getUTCFullYear() - 1);
    return { prevStart, prevEnd };
  }
  const spanMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { prevStart, prevEnd };
};
