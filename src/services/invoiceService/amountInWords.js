const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? " " + ONES[ones] : ""}`;
};

const threeDigits = (n) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [
    hundreds ? `${ONES[hundreds]} Hundred` : "",
    rest ? twoDigits(rest) : "",
  ]
    .filter(Boolean)
    .join(" ");
};

// Converts a non-negative rupee amount to words using the Indian numbering
// system (Lakh/Crore grouping), e.g. 125000 -> "One Lakh Twenty Five
// Thousand". No external dependency — used only for the invoice's
// "Amount in Words" line.
export const amountInWords = (amount, currencyLabel = "Rupees") => {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);

  if (rupees === 0 && paise === 0) return `${currencyLabel} Zero Only`;

  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts = [
    crore ? `${threeDigits(crore)} Crore` : "",
    lakh ? `${threeDigits(lakh)} Lakh` : "",
    thousand ? `${threeDigits(thousand)} Thousand` : "",
    hundred ? threeDigits(hundred) : "",
  ].filter(Boolean);

  const rupeeWords = parts.length ? parts.join(" ") : "Zero";
  const paiseWords = paise ? ` and ${twoDigits(paise)} Paise` : "";

  return `${currencyLabel} ${rupeeWords}${paiseWords} Only`;
};
