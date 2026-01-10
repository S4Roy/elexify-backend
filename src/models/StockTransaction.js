import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

const StockTransactionSchema = new Schema(
  {
    product: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
    },
    type: {
      type: String,
      enum: ["in", "out", "sale", "return", "adjustment"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    reference_id: {
      type: Types.ObjectId,
      default: null, // Can link to orders, returns, etc.
    },
    reference_type: {
      type: String,
      enum: ["order", "purchase", "manual", "return"],
      default: "manual",
    },
    mrp: {
      type: Number,
      default: 0, // Useful for avg. cost/profit
    },
    cost_price: {
      type: Number,
      default: 0, // Useful for avg. cost/profit
    },
    selling_price: {
      type: Number,
      default: 0, // Useful for avg. cost/profit
    },
    created_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: null,
    },
    updated_by: {
      type: Types.ObjectId,
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    deleted_by: {
      type: Types.ObjectId,
      default: null,
    },
  },
  { versionKey: false }
);
StockTransactionSchema.plugin(mongooseAggregatePaginate);

const StockTransaction = model("stock_transactions", StockTransactionSchema);
export default StockTransaction;
