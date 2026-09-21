import moment from "moment-timezone";
import ShippingSettings from "../../models/ShippingSettings.js";
import { getShiprocketTransit } from "./shiprocketTransit.js";

const TIMEZONE = "Asia/Kolkata";
const validDays = value => Number.isInteger(value) && value >= 0 && value <= 90;
const isBusinessDay = (date, weekends, holidays) => !weekends.includes(date.day()) && !holidays.has(date.format("YYYY-MM-DD"));

const nextBusinessDay = (start, weekends, holidays) => {
  const date = start.clone();
  // Guard against invalid legacy settings, including all weekdays excluded.
  for (let i = 0; i < 730; i++) {
    if (isBusinessDay(date, weekends, holidays)) return date;
    date.add(1, "day");
  }
  return null;
};

const addBusinessDays = (start, days, weekends, holidays) => {
  let date = start.clone();
  for (let i = 0; i < days; i++) {
    date = nextBusinessDay(date.add(1, "day"), weekends, holidays);
    if (!date) return null;
  }
  return date;
};

const formatRange = (min, max) => {
  if (min.isSame(max, "day")) return min.format("D MMM YYYY");
  if (min.isSame(max, "month")) return `${min.format("D")}–${max.format("D MMM YYYY")}`;
  return `${min.format(min.isSame(max, "year") ? "D MMM" : "D MMM YYYY")} – ${max.format("D MMM YYYY")}`;
};

// Shiprocket provides elapsed transit days. Apply the warehouse business calendar
// only to dispatch, then add courier transit in calendar days and an admin buffer.
// Manual zone transit retains the existing business-day behavior.
export const calculateDeliveryEstimate = async ({
  min_delivery_days,
  max_delivery_days,
  isAvailable = true,
  postcode,
  country = 101,
  weight = 0.5,
  cod = false,
  now = new Date(),
}) => {
  if (!isAvailable) return null;
  const settings = await ShippingSettings.getSingleton();
  let min = min_delivery_days;
  let max = max_delivery_days;
  let source = "manual";
  if ((settings.delivery_estimate_source ?? "shiprocket") === "shiprocket") {
    const transit = Number(country) === 101
      ? await getShiprocketTransit({ settings, postcode, weight, cod })
      : { status: "unavailable" };
    // No couriers is different from an outage: never manufacture an estimate.
    if (transit.status === "unserviceable") return null;
    if (transit.status === "ok") {
      min = transit.min;
      max = transit.max;
      source = "shiprocket";
    } else {
      if (settings.delivery_fallback_enabled === false) return null;
      source = "fallback";
    }
  }
  if (!validDays(min) || !validDays(max) || max < min) return null;
  const processingMin = settings.processing_days_min ?? 1;
  const processingMax = settings.processing_days_max ?? 2;
  if (!validDays(processingMin) || !validDays(processingMax) || processingMax < processingMin) return null;
  const weekends = settings.exclude_weekends ? settings.weekend_days || [0] : [];
  const holidays = new Set((settings.holidays || []).map(d => moment.utc(d).format("YYYY-MM-DD")));
  const current = moment(now).tz(TIMEZONE).locale("en");
  if (!current.isValid()) return null;
  let start = current.clone().startOf("day");
  if (settings.order_cutoff_time && current.format("HH:mm") >= settings.order_cutoff_time) start.add(1, "day");
  start = nextBusinessDay(start, weekends, holidays);
  if (!start) return null;
  const dispatchMin = addBusinessDays(start, processingMin, weekends, holidays);
  const dispatchMax = addBusinessDays(start, processingMax, weekends, holidays);
  if (!dispatchMin || !dispatchMax) return null;
  const minDate = source === "shiprocket" ? dispatchMin.add(min, "days") : addBusinessDays(dispatchMin, min, weekends, holidays);
  const maxDate = source === "shiprocket" ? dispatchMax.add(max, "days") : addBusinessDays(dispatchMax, max, weekends, holidays);
  if (!minDate || !maxDate) return null;
  const buffer = settings.delivery_buffer_days ?? 1;
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 30) return null;
  maxDate.add(buffer, "days");
  return {
    min_date: minDate.toISOString(),
    max_date: maxDate.toISOString(),
    min_days: minDate.diff(current.clone().startOf("day"), "days"),
    max_days: maxDate.diff(current.clone().startOf("day"), "days"),
    display: formatRange(minDate, maxDate),
    source,
    is_estimate: true,
  };
};
