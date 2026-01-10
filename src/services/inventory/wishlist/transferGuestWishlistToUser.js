import Wishlist from "../../../models/Wishlist.js";
import mongoose from "mongoose";

/**
 * transferGuestWishlistToUser (SAFE)
 */
export const transferGuestWishlistToUser = async (guest_id, user_id) => {
  if (!guest_id || !user_id) return;

  const guestWishlists = await Wishlist.find({
    guest_id,
    deleted_at: null,
  });

  for (const guestItem of guestWishlists) {
    const exists = await Wishlist.findOne({
      user: new mongoose.Types.ObjectId(user_id),
      product: guestItem.product,
      variation: guestItem.variation ?? null,
      deleted_at: null,
    });

    if (exists) {
      // 🧹 User already has it → remove guest entry
      await Wishlist.deleteOne({ _id: guestItem._id });
    } else {
      // ✅ Safe transfer
      await Wishlist.updateOne(
        { _id: guestItem._id },
        {
          $set: { user: user_id },
          $unset: { guest_id: "" },
        }
      );
    }
  }
};
