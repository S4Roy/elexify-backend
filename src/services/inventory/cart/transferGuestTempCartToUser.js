import TempCart from "../../../models/TempCart.js";
import mongoose from "mongoose";

/**
 * transferGuestTempCartToUser (SAFE MERGE)
 */
export const transferGuestTempCartToUser = async (guest_id, user_id) => {
  if (!guest_id || !user_id) return;

  const guestCarts = await TempCart.find({
    guest_id,
    deleted_at: null,
  });

  for (const guestCart of guestCarts) {
    const existingUserCart = await TempCart.findOne({
      user: new mongoose.Types.ObjectId(user_id),
      product: guestCart.product,
      variation: guestCart.variation ?? null,
      deleted_at: null,
    });

    if (existingUserCart) {
      // 🔥 MERGE QUANTITY
      await TempCart.updateOne(
        { _id: existingUserCart._id },
        {
          $inc: { quantity: guestCart.quantity },
          $set: {
            price: guestCart.price,
            discounted_price: guestCart.discounted_price,
          },
        }
      );

      // 🧹 REMOVE GUEST CART ROW
      await TempCart.deleteOne({ _id: guestCart._id });
    } else {
      // ✅ SAFE TRANSFER
      await TempCart.updateOne(
        { _id: guestCart._id },
        {
          $set: { user: user_id },
          $unset: { guest_id: "" },
        }
      );
    }
  }
};
