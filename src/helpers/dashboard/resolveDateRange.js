const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shared query-param → { startDate, endDate } resolver for every dashboard
 * endpoint (order stats, performance, trend, leaderboards) so "from/to" is
 * interpreted identically everywhere. Falls back to a rolling "last N days"
 * window (?days=30) for backward compatibility with callers that predate
 * the from/to-based date-range filter.
 */
export const resolveDateRange = (query = {}) => {
  const { from, to, days } = query;

  let startDate;
  let endDate;

  if (from || to) {
    startDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date(0);
    endDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  } else {
    const n = Math.min(Math.max(parseInt(days, 10) || 30, 1), 366);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    startDate = new Date(endDate.getTime() - (n - 1) * DAY_MS);
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
};

/**
 * The immediately preceding period of equal length — e.g. for
 * "Last 30 Days" this returns the 30 days before that, so KPI cards can
 * show a period-over-period delta regardless of which preset/custom range
 * was selected.
 */
export const getPreviousRange = (startDate, endDate) => {
  const spanMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { prevStart, prevEnd };
};
