// Order-total rounding, as on Indian GST invoices (Tally / Zoho Books
// "Round Off"): items, discounts, shipping and GST stay in paise; only the
// payable total is rounded to the nearest rupee (50 paise rounds up), and
// the difference is shown as a separate round-off line. Other currencies
// keep two decimals.

const isWholeUnitCurrency = (currency) => String(currency || "INR").toUpperCase() === "INR";
const toCents = (amount) => Math.round((Number(amount) || 0) * 100);

/** { total, round_off } for an exact (paise) order total. */
export const roundOrderTotal = (exactTotal, currency = "INR") => {
  const cents = toCents(exactTotal);
  if (!isWholeUnitCurrency(currency)) return { total: cents / 100, round_off: 0 };
  const total = Math.round(cents / 100);
  return { total, round_off: (total * 100 - cents) / 100 };
};

/** Partial COD online advance: whole rupees for INR, so the balance is too. */
export const roundAdvance = (grandTotal, percent, currency = "INR") => {
  const exact = (Number(grandTotal) || 0) * (Number(percent) || 0) / 100;
  return isWholeUnitCurrency(currency) ? Math.round(exact) : Number(exact.toFixed(2));
};
