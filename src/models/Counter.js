import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Generic atomic sequence counter — safe under concurrency without needing
// MongoDB transactions, via findOneAndUpdate({_id: key}, {$inc:{seq:1}},
// {upsert:true, new:true}). Used for invoice numbering (one counter per
// financial year, e.g. _id: "invoice_2026-27").
const CounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = model("counters", CounterSchema);
export default Counter;
