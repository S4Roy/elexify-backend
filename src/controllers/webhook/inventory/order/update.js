import Wishlist from "../../../../models/Wishlist.js";
import Cart from "../../../../models/Cart.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Get wishlist and cart update for user or guest
 */
export const update = async (req, res, next) => {
  try {
    console.log("=====ORDER CONTROLLER=====");
    console.log(req.body);

    return res.status(200).json({
      status: "success",
      message: "Counts retrieved",
    });
  } catch (error) {
    next(error);
  }
};
