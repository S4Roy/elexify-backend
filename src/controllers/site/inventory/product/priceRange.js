import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";

/**
 * Get price range from products & variations
 */
export const priceRange = async (req, res, next) => {
  try {
    const { currency = "INR" } = req.query;
    const rates = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const rate = rates?.rates?.get(currency) ?? 1;

    // ✅ Fetch ranges
    const [simpleRange] = await Product.aggregate([
      { $match: { deleted_at: null, type: "simple", status: "active" } },
      {
        $group: {
          _id: null,
          min: { $min: { $ifNull: ["$sale_price", "$regular_price"] } },
          max: { $max: { $ifNull: ["$sale_price", "$regular_price"] } },
        },
      },
    ]);

    const [variationRange] = await ProductVariation.aggregate([
      { $match: { deleted_at: null, status: "active" } },
      {
        $group: {
          _id: null,
          min: { $min: { $ifNull: ["$sale_price", "$regular_price"] } },
          max: { $max: { $ifNull: ["$sale_price", "$regular_price"] } },
        },
      },
    ]);

    // ✅ Collect available ranges only
    const prices = [];
    if (simpleRange?.min != null) prices.push(simpleRange.min);
    if (simpleRange?.max != null) prices.push(simpleRange.max);
    if (variationRange?.min != null) prices.push(variationRange.min);
    if (variationRange?.max != null) prices.push(variationRange.max);

    // ✅ Compute min/max if any prices exist
    let min = 0,
      max = 0;
    if (prices.length) {
      min = Math.min(...prices) * rate;
      max = Math.max(...prices) * rate;
    }

    return res.status(200).json({
      status: "success",
      message: "Filter retrieved",
      data: {
        price_range: {
          min: Math.floor(min),
          max: Math.ceil(max),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
