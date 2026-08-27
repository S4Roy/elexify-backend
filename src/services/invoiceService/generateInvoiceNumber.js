import Counter from "../../models/Counter.js";

// Indian financial year runs April -> March. A date in Jan-Mar belongs to
// the FY that started the previous April.
export const getFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1; // month is 0-indexed, 3 = April
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

// Atomically allocates the next sequential invoice number for the given
// date's financial year, e.g. "INV/2026-27/000001". Safe under concurrent
// requests without needing a MongoDB transaction (findOneAndUpdate $inc is
// itself atomic).
export const nextInvoiceNumber = async (date = new Date()) => {
  const financialYear = getFinancialYear(date);
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice_${financialYear}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const invoiceNumber = `INV/${financialYear}/${String(counter.seq).padStart(6, "0")}`;
  return { invoiceNumber, financialYear };
};
