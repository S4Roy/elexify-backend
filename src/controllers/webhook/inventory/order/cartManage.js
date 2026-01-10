import Cart from "../../../../models/Cart.js";
import Product from "../../../../models/Product.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Add, Remove, or Update Product in Cart (Supports Auth & Guest)
 */
export const cartManage = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("User or Guest ID is required.");
    }

    const { product_id, quantity = 1 } = req.body;

    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    const product = await Product.findById(product_id).exec();
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    if (quantity > product.current_stock) {
      throw StatusError.badRequest(
        req.__("Only %s item(s) available in stock", product.current_stock)
      );
    }

    // Build search filter using either user_id or guest_id
    const searchFilter = { product: product_id };
    if (user_id) searchFilter.user = user_id;
    else searchFilter.guest_id = guest_id;

    const existingCart = await Cart.findOne(searchFilter);

    if (existingCart && !existingCart.deleted_at) {
      if (quantity <= 0) {
        existingCart.deleted_at = Date.now();
        await existingCart.save();

        return res.status(200).json({
          status: "success",
          message: req.__("Product removed from cart"),
          data: null,
          is_carted: false,
        });
      } else {
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

    // Add new cart item with correct ID field
    const newCart = await Cart.create({
      user: user_id || undefined,
      guest_id: guest_id || undefined,
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
