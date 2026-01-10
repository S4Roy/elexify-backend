import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const CartSchema = new Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: false,
      default: null,
    }, // ✅ Nullable for guest users
    guest_id: {
      type: String, // UUID or any unique string for guest users
      required: false,
      default: null, // ✅ Nullable for guest users
    },
    product: { type: mongoose.Types.ObjectId, ref: "products", required: true },
    variation: {
      type: Types.ObjectId,
      ref: "product_variations",
      default: null, // null for simple products
    },
    customization_id: {
      type: mongoose.Types.ObjectId,
      ref: "product_customizations",
      required: false,
    },
    quantity: { type: Number, required: true, min: 1 },
    // ✅ Add these
    price: { type: Number, required: true }, // Price per unit at the time of addition
    discounted_price: { type: Number, default: null }, // Optional: if a discount applies

    deleted_at: { type: Date, default: null }, // ✅ Soft delete flag
  },
  { timestamps: true }
);

CartSchema.index(
  { user: 1, product: 1, variation: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $type: "objectId" },
    },
  }
);

CartSchema.index(
  { guest_id: 1, product: 1, variation: 1 },
  {
    unique: true,
    partialFilterExpression: {
      guest_id: { $type: "string" },
    },
  }
);

// Apply pagination plugin
CartSchema.plugin(mongooseAggregatePaginate);

// Create model
const Cart = model("carts", CartSchema);

export default Cart;
