import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import {
  STOCK_TRANSACTION_TYPES,
  STOCK_REFERENCE_TYPES,
  STOCK_REASONS,
  STOCK_ACTOR_TYPES,
} from "../constants/stock.js";
const { Schema, model, Types } = mongoose;

// On-hand stock ledger. Every row written by services/stock carries a signed
// `delta` and the post-move `balance_after`, so for any SKU
// sum(delta) == stock_quantity (checked by the stock-reconcile operation).
// Reservations are NOT ledger rows — see StockReservation. Legacy rows
// (pre stock-ledger-foundation) have no delta and are ignored by reconcile.

const StockTransactionSchema = new Schema(
  {
    product: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
    },
    variation: {
      type: Types.ObjectId,
      ref: "product_variations",
      default: null,
    },
    type: {
      type: String,
      enum: STOCK_TRANSACTION_TYPES,
      required: true,
    },
    // Signed on-hand movement (+in / -out). Absent on legacy rows.
    delta: {
      type: Number,
      default: undefined,
    },
    balance_after: {
      type: Number,
      default: undefined,
    },
    reason: {
      type: String,
      enum: [...STOCK_REASONS, null],
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    // Replay guard — e.g. "order:<id>:commit:<epoch>:<sku>". Replaces the old
    // partial unique indexes on {reference_id, product, variation, type},
    // which made a cancel → reopen → cancel cycle collide.
    idempotency_key: {
      type: String,
      default: undefined,
    },
    actor_type: {
      type: String,
      enum: [...STOCK_ACTOR_TYPES, null],
      default: null,
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
      enum: STOCK_REFERENCE_TYPES,
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
StockTransactionSchema.index({ idempotency_key: 1 }, { unique: true, sparse: true });
StockTransactionSchema.index({ product: 1, variation: 1, created_at: -1 });
StockTransactionSchema.index({ reference_id: 1 });
StockTransactionSchema.plugin(mongooseAggregatePaginate);

const StockTransaction = model("stock_transactions", StockTransactionSchema);
export default StockTransaction;
