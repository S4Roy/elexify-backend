import ShippingSettings from "../../models/ShippingSettings.js";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const isBusinessDay = (date, weekendDays, holidaySet) => {
  if (weekendDays.includes(date.getDay())) return false;
  const key = date.toISOString().slice(0, 10);
  if (holidaySet.has(key)) return false;
  return true;
};

const addBusinessDays = (startDate, days, weekendDays, holidaySet) => {
  const date = new Date(startDate);
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (isBusinessDay(date, weekendDays, holidaySet)) {
      remaining -= 1;
    }
  }
  return date;
};

const formatRange = (minDate, maxDate) => {
  const sameMonth =
    minDate.getMonth() === maxDate.getMonth() &&
    minDate.getFullYear() === maxDate.getFullYear();

  if (sameMonth) {
    return `${minDate.getDate()}–${maxDate.getDate()} ${MONTH_NAMES[maxDate.getMonth()]} ${maxDate.getFullYear()}`;
  }

  const sameYear = minDate.getFullYear() === maxDate.getFullYear();
  const minPart = `${minDate.getDate()} ${MONTH_NAMES[minDate.getMonth()]}${sameYear ? "" : " " + minDate.getFullYear()}`;
  const maxPart = `${maxDate.getDate()} ${MONTH_NAMES[maxDate.getMonth()]} ${maxDate.getFullYear()}`;
  return `${minPart} – ${maxPart}`;
};

/**
 * Compute an estimated delivery date range = processing time + transit time,
 * skipping configured weekends/holidays. Returns null when the item is unavailable
 * so the UI never shows a misleading date for out-of-stock products.
 * @param {{ min_delivery_days: number|null, max_delivery_days: number|null, isAvailable: boolean }} params
 */
export const calculateDeliveryEstimate = async ({
  min_delivery_days,
  max_delivery_days,
  isAvailable = true,
}) => {
  if (!isAvailable || min_delivery_days == null || max_delivery_days == null) {
    return null;
  }

  const settings = await ShippingSettings.getSingleton();
  const weekendDays = settings.exclude_weekends ? settings.weekend_days || [] : [];
  const holidaySet = new Set(
    (settings.holidays || []).map((d) => new Date(d).toISOString().slice(0, 10))
  );

  const now = new Date();
  let processingDaysMin = settings.processing_days_min || 0;
  let processingDaysMax = settings.processing_days_max || 0;

  if (settings.order_cutoff_time) {
    const [cutoffHour, cutoffMinute] = settings.order_cutoff_time.split(":").map(Number);
    const cutoff = new Date(now);
    cutoff.setHours(cutoffHour || 0, cutoffMinute || 0, 0, 0);
    if (now > cutoff) {
      processingDaysMin += 1;
      processingDaysMax += 1;
    }
  }

  const processingStartMin = addBusinessDays(now, processingDaysMin, weekendDays, holidaySet);
  const processingStartMax = addBusinessDays(now, processingDaysMax, weekendDays, holidaySet);

  const minDate = addBusinessDays(processingStartMin, min_delivery_days, weekendDays, holidaySet);
  const maxDate = addBusinessDays(processingStartMax, max_delivery_days, weekendDays, holidaySet);

  return {
    min_date: minDate.toISOString(),
    max_date: maxDate.toISOString(),
    min_days: min_delivery_days + processingDaysMin,
    max_days: max_delivery_days + processingDaysMax,
    display: formatRange(minDate, maxDate),
  };
};
