import mongoose from "mongoose";
import { RESERVATION_STATUS } from "../constants/stock.js";
const { Schema, model, Types } = mongoose;

// A hold on available stock for an order awaiting payment. The held units
// are mirrored in Product/ProductVariation.reserved_quantity; this collection
// is the source of truth for which order holds them and until when.
// Reservations never touch on-hand stock, so they are not ledger rows.
const StockReservationSchema = new Schema(
  {
    order: { type: Types.ObjectId, ref: "orders", required: true },
    product: { type: Types.ObjectId, ref: "products", required: true },
    variation: { type: Types.ObjectId, ref: "product_variations", default: null },
    quantity: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(RESERVATION_STATUS),
      default: RESERVATION_STATUS.ACTIVE,
    },
    expires_at: { type: Date, required: true },
    // Order.stock_epoch at reservation time.
    epoch: { type: Number, default: 0 },
    released_reason: { type: String, default: null },
    committed_at: { type: Date, default: null },
    released_at: { type: Date, default: null },
  },
  { versionKey: false, timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

StockReservationSchema.index({ order: 1, product: 1, variation: 1, epoch: 1 }, { unique: true });
StockReservationSchema.index({ status: 1, expires_at: 1 });
StockReservationSchema.index({ product: 1, variation: 1, status: 1 });

const StockReservation = model("stock_reservations", StockReservationSchema);
export default StockReservation;
