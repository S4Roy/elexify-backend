import { serviceability } from "../shiprocket/serviceability.js";

// Cache only transit quotes, never final dates (cutoff and holidays are applied
// on every request). Bound memory and coalesce concurrent checkout requests.
const quotes = new Map();
const TTL = 5 * 60 * 1000;

export const parseTransitDays = (value) => {
  const match = String(value ?? "").trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  return min >= 1 && max >= min && max <= 90 ? { min, max } : null;
};

export const selectTransit = (raw, policy = "recommended", cod = false) => {
  const data = raw?.data;
  const companies = data?.available_courier_companies;
  if (!Array.isArray(companies)) return { status: "unavailable" };
  const eligible = companies.filter(c => c && !Number(c.blocked) && (!cod || Number(c.cod) === 1));
  if (!eligible.length) return { status: "unserviceable" };
  const candidates = eligible.map(c => ({
    id: c.courier_company_id,
    days: parseTransitDays(c.estimated_delivery_days),
  })).filter(c => c.days);
  if (!candidates.length) return { status: "unavailable" };
  const recommended = candidates.find(c => c.id != null && String(c.id) === String(data.recommended_courier_company_id));
  const selected = policy === "recommended" && recommended
    ? recommended
    : candidates.sort((a, b) => policy === "fastest"
      ? a.days.max - b.days.max || a.days.min - b.days.min
      : b.days.max - a.days.max || b.days.min - a.days.min)[0];
  return { status: "ok", ...selected.days };
};

export const getShiprocketTransit = async ({ settings, postcode, weight, cod = false }) => {
  const pickup = String(settings.delivery_pickup_postcode || "");
  if (!/^[1-9]\d{5}$/.test(pickup) || !/^[1-9]\d{5}$/.test(String(postcode || ""))) {
    return { status: "unavailable" };
  }
  const weightKg = Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 0.5;
  const params = { pickup_pincode: pickup, delivery_pincode: String(postcode), weight_kg: weightKg, cod: cod ? 1 : 0, timeout_ms: 5000 };
  const key = JSON.stringify([params, settings.delivery_courier_policy]);
  const cached = quotes.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  if (quotes.size >= 500) quotes.delete(quotes.keys().next().value);
  const entry = { expires: Date.now() + TTL };
  entry.promise = serviceability(params).then(result => {
    const transit = result?.success ? selectTransit(result.raw, settings.delivery_courier_policy, cod) : { status: "unavailable" };
    if (transit.status === "unavailable") entry.expires = Date.now() + 30000;
    return transit;
  }).catch(() => {
    entry.expires = Date.now() + 30000;
    return { status: "unavailable" };
  });
  quotes.set(key, entry);
  return entry.promise;
};
