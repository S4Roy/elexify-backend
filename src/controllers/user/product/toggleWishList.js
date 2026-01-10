import Wishlist from "../../../models/Wishlist.js";
import Product from "../../../models/Product.js";
import { StatusError } from "../../../config/index.js";

/**
 * Toggle Wishlist (Add/Remove)
 */
export const toggleWishList = async (req, res, next) => {
  try {
    console.log("Toggle Wishlist Request:", req.auth);

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized(
        "Invalid access. User or Guest ID is required."
      );
    }

    const { product_id } = req.body;
    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    // 🔍 Check if product exists
    const product = await Product.findById(product_id).exec();
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    // 🔄 Check for existing wishlist entry
    const findCondition = {
      product: product_id,
      ...(user_id ? { user: user_id } : { guest_id }),
    };

    const exists = await Wishlist.findOne(findCondition).exec();

    if (exists) {
      await Wishlist.deleteOne({ _id: exists._id });

      return res.status(200).json({
        status: "success",
        message: req.__("Product removed from wishlist"),
        data: null,
        is_wishlist: false,
      });
    }

    // ➕ Add to wishlist
    const data = await Wishlist.create({
      product: product_id,
      ...(user_id ? { user: user_id } : { guest_id }),
    });

    return res.status(200).json({
      status: "success",
      message: req.__("Product wishlisted successfully"),
      data,
      is_wishlist: true,
    });
  } catch (error) {
    next(error);
  }
};
