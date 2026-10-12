import { addDaysYmd, istDayEnd, istDayStart, istYmd } from "../../config/storeTime.js";

/**
 * Shared query-param → { startDate, endDate } resolver for every dashboard
 * and report endpoint (order stats, performance, trend, leaderboards,
 * reports) so "from/to" is interpreted identically everywhere: whole IST
 * days (config/storeTime.js), whatever the server timezone. Falls back to a
 * rolling "last N days" window (?days=30, ending today IST) for callers that
 * predate the from/to-based date-range filter.
 */
export const resolveDateRange = (query = {}) => {
  const { from, to, days } = query;

  if (from || to) {
    return {
      startDate: from ? istDayStart(from) : new Date(0),
      endDate: to ? istDayEnd(to) : new Date(),
    };
  }

  const n = Math.min(Math.max(parseInt(days, 10) || 30, 1), 366);
  const today = istYmd();
  return { startDate: istDayStart(addDaysYmd(today, -(n - 1))), endDate: istDayEnd(today) };
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
