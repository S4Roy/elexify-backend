import TempCart from "../../../../models/TempCart.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";
import { inventoryService } from "../../../../services/index.js";

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

    const baseFilter = user_id ? { user: user_id } : { guest_id };

    // Normal cart checkout explicitly clears any stale direct-checkout row.
    // Clearing does not require a product identifier.
    if (Number(quantity) <= 0) {
      await TempCart.deleteMany({ ...baseFilter, deleted_at: null });
      return res.status(200).json({
        status: "success",
        message: req.__("TempCart cleared"),
        data: null,
        is_carted: false,
      });
    }

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

    // 🔹 Apply quantity-based discount tiers (product-level) on top of the current price
    let discount_percent = null;
    if (Array.isArray(product.quantity_discounts) && product.quantity_discounts.length) {
      const tierResult = inventoryService.cartService.calculateQuantityDiscount({
        basePrice: discounted_price ?? price,
        quantity,
        tiers: product.quantity_discounts,
      });
      if (tierResult.discountPercent > 0) {
        discounted_price = tierResult.unitPrice;
        discount_percent = tierResult.discountPercent;
      }
    }

    // 🔍 Base filter: always per user or guest
    const itemFilter = {
      ...baseFilter,
      product: product_id,
      variation: variation_id || null,
    };

    // Delete a previous Buy Now selection, but retain this item's row so it
    // can be updated atomically. The former delete-then-create sequence raced
    // when checkout revalidation and a double request arrived together,
    // producing E11000 for the unique user/product/variation index.
    await TempCart.deleteMany({
      ...baseFilter,
      deleted_at: null,
      $nor: [
        {
          product: product_id,
          variation: variation_id || null,
        },
      ],
    });

    const update = {
      $set: {
        quantity,
        price,
        discounted_price,
        discount_percent,
        deleted_at: null,
      },
    };
    let newCart;
    try {
      newCart = await TempCart.findOneAndUpdate(itemFilter, update, {
        new: true,
        upsert: true,
        runValidators: true,
      });
    } catch (error) {
      // Two first-time requests can still race at the unique-index boundary:
      // the winner inserts, then the loser retries as a normal update.
      if (error?.code !== 11000) throw error;
      newCart = await TempCart.findOneAndUpdate(itemFilter, update, {
        new: true,
        runValidators: true,
      });
      if (!newCart) {
        throw error;
      }
    }

    // A concurrent request for a different product may have landed after the
    // first cleanup. Enforce TempCart's single-selection contract once more.
    await TempCart.deleteMany({
      ...baseFilter,
      _id: { $ne: newCart._id },
      deleted_at: null,
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
