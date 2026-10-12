// The store runs on India Standard Time. Every "day" the business sees —
// admin date filters, dashboard/report grouping, invoice financial years,
// email dates, scheduled jobs — is an IST day, independent of the server's
// own timezone (dates are still stored in UTC). IST has no daylight saving,
// so a fixed +05:30 offset is exact.
export const STORE_TIMEZONE = "Asia/Kolkata";
const OFFSET = "+05:30";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** IST calendar date ("YYYY-MM-DD") of an instant (default: now). */
export const istYmd = (date = new Date()) => ymdFormatter.format(new Date(date));

/** IST { year, month (1-12), day } of an instant (default: now). */
export const istParts = (date = new Date()) => {
  const [year, month, day] = istYmd(date).split("-").map(Number);
  return { year, month, day };
};

// A filter value is either a bare "YYYY-MM-DD" (an IST calendar day) or a
// full timestamp, whose IST calendar day is used.
const toYmd = (value) => {
  const text = String(value).trim();
  return YMD.test(text) ? text : istYmd(new Date(text));
};

/** First instant of the IST day `value` falls on. */
export const istDayStart = (value = new Date()) => new Date(`${toYmd(value)}T00:00:00.000${OFFSET}`);

/** Last instant of the IST day `value` falls on. */
export const istDayEnd = (value = new Date()) => new Date(`${toYmd(value)}T23:59:59.999${OFFSET}`);

/** "YYYY-MM-DD" shifted by `days` calendar days. */
export const addDaysYmd = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** "YYYY-MM" shifted by `months` calendar months. */
export const addMonthsYm = (ym, months) => {
  const d = new Date(`${ym}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 7);
};

/** Mongo `created_at`-style range for optional from/to filter values. */
export const istRange = (from, to) => {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = istDayStart(from);
  if (to) range.$lte = istDayEnd(to);
  return range;
};

/** Indian financial year (Apr–Mar) start year of an instant, in IST. */
export const istFinancialYearStart = (date = new Date()) => {
  const { year, month } = istParts(date);
  return month >= 4 ? year : year - 1;
};
