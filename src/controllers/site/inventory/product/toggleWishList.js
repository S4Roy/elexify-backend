import Wishlist from "../../../../models/Wishlist.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
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

    const { product_id, variation_id = null } = req.body;
    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    // ✅ Validate product
    const product = await Product.findById(product_id);
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    // ✅ If variable product, variation_id must be valid
    if (product.type === "variable") {
      if (!variation_id) {
        throw StatusError.badRequest(
          req.__("Variation ID is required for variable product")
        );
      }

      const variation = await ProductVariation.findOne({
        _id: variation_id,
        product_id: product_id,
      }).exec();

      if (!variation) {
        throw StatusError.notFound(req.__("Variation not found"));
      }
    }

    // ✅ Build query filter for finding wishlist entry
    const filter = {
      product: product_id,
      variation: variation_id || null,
      ...(user_id ? { user: user_id } : { guest_id }),
    };

    const existing = await Wishlist.findOne(filter);

    if (existing) {
      // ✅ Toggle OFF (remove from wishlist)
      await Wishlist.deleteOne({ _id: existing._id });
      return res.status(200).json({
        status: "success",
        message: req.__("Product removed from wishlist"),
        data: null,
        is_wishlisted: false,
      });
    }

    // ✅ Toggle ON (add to wishlist)
    const data = await Wishlist.create(filter);

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
