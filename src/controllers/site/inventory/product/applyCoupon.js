import Cart from "../../../../models/Cart.js";
import TempCart from "../../../../models/TempCart.js";
import { StatusError } from "../../../../config/index.js";
import { inventoryService } from "../../../../services/index.js";
import mongoose from "mongoose";

export const applyCoupon = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Invalid access token");
    }

    const { code, currency = "INR", isDirectCheckout } = req.body;

    /* =========================
       Cart
    ========================== */
    const matchFilter = {
      deleted_at: null,
      ...(user_id
        ? { user: new mongoose.Types.ObjectId(user_id) }
        : { guest_id }),
    };
    let carts = [];
    if (isDirectCheckout) {
      // Handle direct checkout specific logic
      carts = await TempCart.find(matchFilter).populate("product variation");
    } else {
      carts = await Cart.find(matchFilter).populate("product variation");
    }

    if (!carts.length) {
      throw StatusError.badRequest("Cart is empty");
    }

    /* =========================
       Validate Coupon
    ========================== */
    const data = await inventoryService.cartService.validateCoupon({
      code,
      user: user_id ? { _id: user_id } : null,
      carts,
      currency,
    });

    res.status(200).json({
      status: "success",
      message: "Coupon applied",
      data: data,
    });
  } catch (e) {
    next(e);
  }
};
