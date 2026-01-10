import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const CurrencySchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      length: 3, // e.g. "USD", "INR"
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    flag: {
      type: String, // Can be a URL to a flag image or Unicode emoji flag
      default: null,
    },
    icon: {
      type: String, // Can be a URL to a flag image or Unicode emoji flag
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    rates: { type: Number },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Optional: indexes for faster queries
CurrencySchema.index({ code: 1 });

// Pre-save hook to update updated_at timestamp
CurrencySchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});
CurrencySchema.plugin(mongooseAggregatePaginate);

const Currency = model("currencies", CurrencySchema);
export default Currency;
