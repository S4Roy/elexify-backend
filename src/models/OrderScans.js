import mongoose from "mongoose";
const { Schema, model } = mongoose;

const OrderScansSchema = new Schema(
  {
    order_id: { type: Schema.Types.ObjectId, ref: "orders", required: true },
    date: { type: Date, default: null },
    activity: { type: String },
    location: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const OrderScans = model("order_scans", OrderScansSchema);
export default OrderScans;
