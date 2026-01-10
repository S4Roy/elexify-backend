import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const WishlistSchema = new Schema(
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
    product: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
    },
    variation: {
      type: Types.ObjectId,
      ref: "product_variations",
      default: null, // null for simple products
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { versionKey: false }
);

// For logged-in users only (user != null)
WishlistSchema.index(
  { user: 1, product: 1, variation: 1 },
  {
    unique: true,
    partialFilterExpression: { user: { $exists: true, $ne: null } },
  }
);

// For guest users only (guest_id != null)
WishlistSchema.index(
  { guest_id: 1, product: 1, variation: 1 },
  {
    unique: true,
    partialFilterExpression: { guest_id: { $exists: true, $ne: null } },
  }
);

// Apply pagination plugin
WishlistSchema.plugin(mongooseAggregatePaginate);

// Create model
const Wishlist = model("wishlists", WishlistSchema);

export default Wishlist;
