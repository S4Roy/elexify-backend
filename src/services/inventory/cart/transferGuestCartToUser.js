import Cart from "../../../models/Cart.js";
import mongoose from "mongoose";

/**
 * transferGuestCartToUser (SAFE MERGE)
 */
export const transferGuestCartToUser = async (guest_id, user_id) => {
  if (!guest_id || !user_id) return;

  const guestCarts = await Cart.find({
    guest_id,
    deleted_at: null,
  });

  for (const guestCart of guestCarts) {
    // Match soft-deleted rows too: the unique user+product+variation index
    // ignores deleted_at, so moving the guest row onto it would hit E11000.
    const existingUserCart = await Cart.findOne({
      user: new mongoose.Types.ObjectId(user_id),
      product: guestCart.product,
      variation: guestCart.variation ?? null,
    });

    if (existingUserCart) {
      // 🔥 MERGE QUANTITY
      await Cart.updateOne(
        { _id: existingUserCart._id },
        existingUserCart.deleted_at
          ? {
              // Revive a removed item with only the guest quantity
              $set: {
                quantity: guestCart.quantity,
                price: guestCart.price,
                discounted_price: guestCart.discounted_price,
                deleted_at: null,
              },
            }
          : {
              $inc: { quantity: guestCart.quantity },
              $set: {
                price: guestCart.price,
                discounted_price: guestCart.discounted_price,
              },
            }
      );

      // 🧹 REMOVE GUEST CART ROW
      await Cart.deleteOne({ _id: guestCart._id });
    } else {
      // ✅ SAFE TRANSFER
      await Cart.updateOne(
        { _id: guestCart._id },
        {
          $set: { user: user_id },
          $unset: { guest_id: "" },
        }
      );
    }
  }
};
