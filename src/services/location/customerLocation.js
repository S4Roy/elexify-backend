import User from "../../models/User.js";
import { StatusError } from "../../config/index.js";
import { reverseGeocodeLocation } from "./reverseGeocodeLocation.js";

// A customer's last known location, sent by the app at most once a day while
// it's open and only after the customer granted location permission. Stores
// the coordinates (with the GPS accuracy and whether precise location was
// allowed) plus the resolved pincode/city/state. Only the latest reading is
// kept — no history trail — and it's erased with the account.

// 6 decimals ≈ 0.1 m: the precision GPS can actually deliver.
const ROUND = 1e6;
// The app sends daily; anything more often is a retry or misuse.
const MIN_INTERVAL_MS = 6 * 3600_000;
// A repeat inside the interval is ignored unless the customer has moved.
const MIN_MOVE_M = 100;

export const roundCoordinate = (value) => Math.round(Number(value) * ROUND) / ROUND;

const validCoordinates = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// Haversine distance in metres.
export const distanceMetres = (a, b) => {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

/**
 * Resolves and stores the location. Returns the stored one, or the previous
 * one when called again too soon without having moved.
 */
export const recordCustomerLocation = async ({ userId, latitude, longitude, accuracy, precise, now = new Date() }) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!validCoordinates(lat, lng)) throw StatusError.badRequest("Invalid coordinates");
  const point = { latitude: roundCoordinate(lat), longitude: roundCoordinate(lng) };

  const user = await User.findOne({ _id: userId, deleted_at: null, role: "customer" }).select("last_location").lean();
  if (!user) throw StatusError.notFound("Customer not found");
  const previous = user.last_location;
  if (previous?.recorded_at && now - new Date(previous.recorded_at) < MIN_INTERVAL_MS &&
      Number.isFinite(previous.latitude) && Number.isFinite(previous.longitude) &&
      distanceMetres(previous, point) < MIN_MOVE_M) {
    return { location: previous, updated: false };
  }

  const result = await reverseGeocodeLocation(point.latitude, point.longitude);
  // Geocoder down: keep the point so the area can be resolved later rather
  // than losing the reading.
  const resolved = result?.resolved || {};
  const accuracyM = Number(accuracy);
  const location = {
    pincode: /^\d{6}$/.test(String(resolved.pincode || "")) ? String(resolved.pincode) : null,
    city: resolved.city?.name || result?.suggestedCityName || null,
    city_id: Number.isFinite(Number(resolved.city?.id)) ? Number(resolved.city.id) : null,
    state: resolved.state?.name || null,
    state_id: Number.isFinite(Number(resolved.state?.id)) ? Number(resolved.state.id) : null,
    serviceable: resolved.serviceable === true,
    ...point,
    accuracy_m: accuracy != null && Number.isFinite(accuracyM) && accuracyM >= 0 ? Math.round(accuracyM) : null,
    precise: typeof precise === "boolean" ? precise : null,
    geo: { type: "Point", coordinates: [point.longitude, point.latitude] },
    recorded_at: now,
  };
  await User.updateOne({ _id: userId }, { $set: { last_location: location } });
  return { location, updated: true };
};
