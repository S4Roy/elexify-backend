import Cart from "../../../../models/Cart.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";

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

    // 🔹 Fetch product (lightweight)
    const product = await Product.findById(product_id)
      .select("type stock_quantity regular_price sale_price")
      .lean();

    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    // 🔹 Build cart filter
    const searchFilter = {
      product: product_id,
      variation: variation_id || null,
      ...(user_id ? { user: user_id } : { guest_id }),
    };

    const existingCart = await Cart.findOne(searchFilter);
    const existingQty = existingCart?.quantity || 0;

    let stock = 0;
    let price = 0;
    let discounted_price = null;

    // 🔹 Handle pricing + stock
    if (product.type === "variable") {
      if (!variation_id) {
        throw StatusError.badRequest(
          req.__("Variation ID is required for variable product"),
        );
      }

      const variation = await ProductVariation.findOne({
        _id: variation_id,
        product_id,
      })
        .select("stock_quantity regular_price sale_price")
        .lean();

      if (!variation) {
        throw StatusError.notFound(req.__("Variation not found"));
      }

      stock = variation.stock_quantity;
      price = variation.regular_price;

      if (
        variation.sale_price &&
        variation.sale_price < variation.regular_price
      ) {
        discounted_price = variation.sale_price;
      }
    } else {
      stock = product.stock_quantity;
      price = product.regular_price;

      if (product.sale_price && product.sale_price < product.regular_price) {
        discounted_price = product.sale_price;
      }
    }

    // 🔹 Validate stock
    if (quantity > stock) {
      throw StatusError.badRequest(
        req.__("Only %s item(s) available in stock", stock),
      );
    }

    // 🔹 Remove case
    if (quantity <= 0) {
      if (existingCart && !existingCart.deleted_at) {
        existingCart.deleted_at = new Date();
        await existingCart.save();
      }

      return res.status(200).json({
        status: "success",
        message: req.__("Product removed from cart"),
        data: null,
        is_carted: false,
      });
    }

    // 🔹 Update existing
    if (existingCart) {
      existingCart.deleted_at = null;
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

    // 🔹 Create new
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
