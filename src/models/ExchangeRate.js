import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const ExchangeRateSchema = new Schema(
  {
    base: { type: String, default: "INR" },
    rates: { type: Map, of: Number },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Create model
const ExchangeRate = model("exchange_rates", ExchangeRateSchema);

export default ExchangeRate;
