import Cart from "../../../../models/Cart.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Add, Remove, or Update Product in Cart (Supports Auth & Guest, Simple & Variable)
 */
export const cartManage = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("User or Guest ID is required.");
    }

    const { product_id, variation_id = null, quantity = 1 } = req.body;

    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    const product = await Product.findById(product_id).exec();
    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    let price = 0;
    let discounted_price = null;

    // ✅ If variable product, validate variation_id and pricing
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

      if (quantity > variation.stock_quantity) {
        throw StatusError.badRequest(
          req.__("Only %s item(s) available in stock", variation.stock_quantity)
        );
      }

      price = variation.regular_price;
      if (
        variation.sale_price &&
        variation.sale_price < variation.regular_price
      ) {
        discounted_price = variation.sale_price;
      }
    } else {
      // ✅ For simple product, check product stock
      if (quantity > product.stock_quantity) {
        throw StatusError.badRequest(
          req.__("Only %s item(s) available in stock", product.stock_quantity)
        );
      }

      price = product.regular_price;
      if (product.sale_price && product.sale_price < product.regular_price) {
        discounted_price = product.sale_price;
      }
    }

    // 🔍 Build filter with user/guest + product + variation (nullable)
    const searchFilter = {
      product: product_id,
      variation: variation_id || null,
    };
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
        existingCart.price = price;
        existingCart.discounted_price = discounted_price;
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
      existingCart.price = price;
      existingCart.discounted_price = discounted_price;
      await existingCart.save();

      return res.status(200).json({
        status: "success",
        message: req.__("Product re-added to cart"),
        data: existingCart,
        is_carted: true,
      });
    }

    // ➕ Create new cart entry
    const newCart = await Cart.create({
      user: user_id || undefined,
      guest_id: guest_id || undefined,
      product: product_id,
      variation: variation_id || null,
      quantity,
      price,
      discounted_price,
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
