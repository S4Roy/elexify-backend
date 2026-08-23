import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { StatusError } from "../../../../config/index.js";
import { shippingService } from "../../../../services/index.js";

/**
 * Product-page "check delivery" — no auth/saved-address required, takes a raw
 * postcode/state/country and a single product to estimate shipping + delivery date.
 */
export const estimate = async (req, res, next) => {
  try {
    const { postcode, country = 101, state = null, product_id, variation_id = null } = req.body;

    if (!postcode) {
      throw StatusError.badRequest(req.__("Postcode is required"));
    }
    if (!product_id) {
      throw StatusError.badRequest(req.__("Product ID is required"));
    }

    const product = await Product.findOne({ _id: product_id, deleted_at: null })
      .select("type weight shipping_class stock_quantity status")
      .lean();

    if (!product) {
      throw StatusError.notFound(req.__("Product not found"));
    }

    let source = product;
    if (product.type === "variable") {
      if (!variation_id) {
        throw StatusError.badRequest(req.__("Variation ID is required for variable product"));
      }
      const variation = await ProductVariation.findOne({
        _id: variation_id,
        product_id,
        deleted_at: null,
      })
        .select("weight shipping_class stock_quantity status")
        .lean();
      if (!variation) {
        throw StatusError.notFound(req.__("Variation not found"));
      }
      source = variation;
    }

    const isAvailable =
      source.status !== "inactive" && (source.stock_quantity ?? 0) > 0;

    const rateResult = await shippingService.calculateShippingRate({
      items: [{ shipping_class: source.shipping_class, weight: source.weight || 0, quantity: 1 }],
      address: { country, state, postcode },
      orderSubtotal: 0,
    });

    const delivery = await shippingService.calculateDeliveryEstimate({
      min_delivery_days: rateResult.min_delivery_days,
      max_delivery_days: rateResult.max_delivery_days,
      isAvailable,
    });

    res.status(200).json({
      status: "success",
      message: req.__("Estimate fetched successfully"),
      data: {
        shipping: { amount: rateResult.amount, zone: rateResult.zone?.name ?? null },
        delivery,
        is_available: isAvailable,
      },
    });
  } catch (error) {
    next(error);
  }
};
