import moment from "moment-timezone";

// Shiprocket documents DD MM YYYY HH:mm:ss in India local time.
export const shiprocketEventDate = (value) => {
  if (!value) return new Date();
  const local = moment.tz(String(value), ["DD MM YYYY HH:mm:ss", "YYYY-MM-DD HH:mm:ss"], true, "Asia/Kolkata");
  if (local.isValid()) return local.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
};

// Keep the provider's vocabulary separate from fulfillment/payment states.
// Exceptions such as RTO and NDR must remain visible even without a mapping.
export const shiprocketStatusFields = (status, at, current = {}) => {
  if (typeof status !== "string" || !status.trim()) return {};
  if (current.shiprocket_status_updated_at && new Date(current.shiprocket_status_updated_at) > at) return {};
  return { shiprocket_status: status.trim(), shiprocket_status_updated_at: at };
};
