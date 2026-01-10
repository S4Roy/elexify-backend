import Cart from "../../../models/Cart.js";
import Product from "../../../models/Product.js";
import { StatusError } from "../../../config/index.js";

/**
 * Add, Remove, or Update Product in Cart
 * @param req
 * @param res
 * @param next
 */
export const cartManage = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const { product_id, quantity = 1 } = req.body;

    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    // ✅ Find product
    const product = await Product.findById(product_id).exec();
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    // ✅ Check stock
    if (quantity > product.current_stock) {
      throw StatusError.badRequest(
        req.__("Only %s item(s) available in stock", product.current_stock)
      );
    }

    // ✅ Find existing cart item (including deleted ones)
    const existingCart = await Cart.findOne({
      user: user_id,
      product: product_id,
    });

    if (existingCart && !existingCart.deleted_at) {
      if (quantity <= 0) {
        // 🗑️ Remove from cart if quantity is zero or less
        existingCart.deleted_at = Date.now();
        await existingCart.save();

        return res.status(200).json({
          status: "success",
          message: req.__("Product removed from cart"),
          data: null,
          is_carted: false,
        });
      } else {
        // 🔁 Update quantity
        existingCart.quantity = quantity;
        await existingCart.save();

        return res.status(200).json({
          status: "success",
          message: req.__("Cart updated successfully"),
          data: existingCart,
          is_carted: true,
        });
      }
    }

    if (existingCart && existingCart.deleted_at) {
      // ♻️ Restore soft-deleted with new quantity
      existingCart.deleted_at = null;
      existingCart.quantity = quantity;
      await existingCart.save();

      return res.status(200).json({
        status: "success",
        message: req.__("Product re-added to cart"),
        data: existingCart,
        is_carted: true,
      });
    }

    // ➕ Add new item to cart
    const newCart = await Cart.create({
      user: user_id,
      product: product_id,
      quantity,
    });

    return res.status(200).json({
      status: "success",
      message: req.__("Product added to cart"),
      data: newCart,
      is_carted: true,
    });
  } catch (error) {
    next(error);
  }
};
