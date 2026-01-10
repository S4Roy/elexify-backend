import mongoose from "mongoose";
const { Schema, model } = mongoose;

const OrderItemSchema = new Schema(
  {
    order_id: { type: Schema.Types.ObjectId, ref: "orders", required: true },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    variation_id: {
      type: Schema.Types.ObjectId,
      ref: "product_variations",
      default: null, // null for simple products
    },
    customization_id: {
      type: Schema.Types.ObjectId,
      ref: "product_customizations",
      default: null, // null for simple products
    },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    total_price: { type: Number, required: true },
    regular_price: { type: Number },
    sale_price: { type: Number },
    currency: { type: String, default: "INR" },
    exchnage_rate: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const OrderItem = model("order_items", OrderItemSchema);
export default OrderItem;
