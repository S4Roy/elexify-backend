import Counter from "../../models/Counter.js";

const ORDER_NUMBER_COUNTER_ID = "order_number";
const ORDER_NUMBER_PAD = 6;

// Atomically allocates the next short, sequential, human-readable order
// number, e.g. "ORD-010705" — replaces the old "ORD-<24-char sha256 hex>"
// scheme, which was unique but unreadable and awkward to read out, search,
// or reference in support conversations. findOneAndUpdate's $inc is atomic,
// so this is safe under concurrent checkouts without a transaction.
export const nextOrderNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: ORDER_NUMBER_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return `ORD-${String(counter.seq).padStart(ORDER_NUMBER_PAD, "0")}`;
};
