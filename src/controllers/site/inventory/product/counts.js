import mongoose from "mongoose";
import Wishlist from "../../../../models/Wishlist.js";
import Cart from "../../../../models/Cart.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Get wishlist and cart counts for user or guest
 * Only count items whose referenced product is active (not soft-deleted)
 */
export const counts = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("User or Guest ID is required.");
    }

    // Build the base match for wishlist/cart documents
    const baseMatch = {
      deleted_at: null,
      ...(user_id
        ? { user: mongoose.Types.ObjectId(String(user_id)) }
        : { guest_id }),
    };

    // Helper pipeline to count docs where referenced product is active (not deleted)
    const buildCountPipeline = (collectionName) => [
      { $match: baseMatch },
      // Lookup product document (assumes field name is "product" in wishlist/cart)
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      // Only keep items that have a matched product
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: false } },
      // Ensure product is active and not soft-deleted
      {
        $match: {
          "product.deleted_at": null,
          // if you use a status field to indicate active/inactive:
          // change or remove the next line depending on your schema
          "product.status": "active",
        },
      },
      { $count: "count" },
    ];

    const [wishlistAgg, cartAgg] = await Promise.all([
      Wishlist.aggregate(buildCountPipeline("wishlist")).allowDiskUse(true),
      Cart.aggregate(buildCountPipeline("cart")).allowDiskUse(true),
    ]);

    const wishlistCount = wishlistAgg?.[0]?.count || 0;
    const cartCount = cartAgg?.[0]?.count || 0;

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
