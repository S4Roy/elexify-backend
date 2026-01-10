import Cart from "../../../models/Cart.js";

/**
 * Clear Carts
 * @param details
 */
export const clearCarts = async (user_id) => {
  if (!user_id) return;

  await Cart.deleteMany({ user: user_id });
};
