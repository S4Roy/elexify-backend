// INR shipping is charged in whole rupees: round the final calculated
// charge once, to the nearest rupee (50 paise rounds up). Other currencies
// retain two decimal places in their minor unit.
export const roundShippingCharge = (amount, currency = "INR") => {
  const nonNegative = Math.max(0, Number(amount) || 0);
  const cents = Math.round(nonNegative * 100);
  return String(currency).toUpperCase() === "INR"
    ? Math.round(cents / 100)
    : cents / 100;
};
