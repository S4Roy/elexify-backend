import Wishlist from "../../../../models/Wishlist.js";
import Cart from "../../../../models/Cart.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Get wishlist and cart counts for user or guest
 */
export const counts = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("User or Guest ID is required.");
    }

    const filter = {
      deleted_at: null,
      ...(user_id ? { user: user_id } : { guest_id }),
    };

    const [wishlistCount, cartCount] = await Promise.all([
      Wishlist.countDocuments(filter),
      Cart.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: "success",
      message: "Counts retrieved",
      data: {
        wishlist: wishlistCount,
        cart: cartCount,
      },
    });
  } catch (error) {
    next(error);
  }
};
