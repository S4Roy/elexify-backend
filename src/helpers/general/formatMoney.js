export const formatMoney = (value, currency = "INR", locale = "en-IN") => {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(value || 0));
};
