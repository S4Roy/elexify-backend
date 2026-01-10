import Wishlist from "../../../../models/Wishlist.js";
import Product from "../../../../models/Product.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Toggle Wishlist (Add/Remove)
 * Supports both user and guest
 */
export const toggleWishList = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("User or Guest ID is required.");
    }

    const { product_id } = req.body;
    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    const product = await Product.findById(product_id);
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    // Build query filter
    const filter = {
      product: product_id,
      deleted_at: null,
      ...(user_id ? { user: user_id } : { guest_id }),
    };

    const existing = await Wishlist.findOne(filter);

    if (existing) {
      await Wishlist.deleteOne({ _id: existing._id });
      return res.status(200).json({
        status: "success",
        message: req.__("Product removed from wishlist"),
        data: null,
        is_wishlisted: false,
      });
    }

    const data = await Wishlist.create({
      product: product_id,
      ...(user_id ? { user: user_id } : { guest_id }),
    });

    return res.status(200).json({
      status: "success",
      message: req.__("Product added to wishlist"),
      data,
      is_wishlisted: true,
    });
  } catch (error) {
    next(error);
  }
};
