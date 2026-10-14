import { releaseExpiredReservations as run } from "../../services/stock/expiry.js";

// Frees stock held by prepaid / Partial COD orders whose payment didn't
// arrive within the reservation TTL (see services/stock/expiry.js).
export const releaseExpiredReservations = async () => {
  const summary = await run();
  if (summary.released || summary.finalized) {
    console.log("[Reservation expiry]", summary);
  }
  return summary;
};
