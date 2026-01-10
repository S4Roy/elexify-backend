import TempCart from "../../../../models/TempCart.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";

/**
 * Add, Remove, or Update Product in TempCart (Supports Auth & Guest, Simple & Variable)
 */
export const tempCartManage = async (req, res, next) => {
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

    // ✅ Handle variable products
    if (product.type === "variable") {
      if (!variation_id) {
        throw StatusError.badRequest(
          req.__("Variation ID is required for variable product")
        );
      }

      const variation = await ProductVariation.findOne({
        _id: variation_id,
        product_id,
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
      // ✅ Simple product
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

    // 🔍 Base filter: always per user or guest
    const baseFilter = user_id ? { user: user_id } : { guest_id };

    // ✅ Ensure only one active TempCart per user/guest
    await TempCart.deleteMany({ ...baseFilter, deleted_at: null });

    // 🚨 If quantity <= 0 → clear cart and exit
    if (quantity <= 0) {
      return res.status(200).json({
        status: "success",
        message: req.__("TempCart cleared"),
        data: null,
        is_carted: false,
      });
    }

    // ➕ Create new single entry
    const newCart = await TempCart.create({
      ...baseFilter,
      product: product_id,
      variation: variation_id || null,
      quantity,
      price,
      discounted_price,
    });

    return res.status(200).json({
      status: "success",
      message: req.__("TempCart updated successfully"),
      data: newCart,
      is_carted: true,
    });
  } catch (error) {
    next(error);
  }
};
