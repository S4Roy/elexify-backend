import mongoose from "mongoose";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import ProductResource from "../../../../resources/ProductResource.js";
import { StatusError } from "../../../../config/index.js";

export const compare = async (req, res, next) => {
  try {
    const ids = [...new Set((req.body?.product_ids || []).map(String))];
    if (!ids.length) throw StatusError.badRequest("Select at least one product to compare.");
    if (ids.length > 4) throw StatusError.badRequest("You can compare up to 4 products at a time.");
    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) throw StatusError.badRequest("Invalid product selection.");

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const [products, variations, specificationRows, rates] = await Promise.all([
      Product.find({ _id: { $in: objectIds }, status: "active", deleted_at: null })
        .populate("images brand categories sub_categories shipping_class")
        .lean(),
      ProductVariation.find({ product_id: { $in: objectIds }, status: "active", deleted_at: null })
        .populate("images attributes.attribute_id attributes.value_id")
        .lean(),
      ProductSpecification.aggregate([
        { $match: { product_id: { $in: objectIds }, status: "active", deleted_at: null, value: { $nin: [null, ""] } } },
        { $lookup: { from: "specifications", localField: "specification_id", foreignField: "_id", as: "definition" } },
        { $unwind: { path: "$definition", preserveNullAndEmptyArrays: true } },
        { $match: { "definition.visible": true, "definition.status": "active" } },
        { $sort: { "definition.sort_order": 1, created_at: -1 } },
        { $project: { product_id: 1, variation_id: 1, key: 1, label: 1, value: 1, value_string: 1, unit: 1, "definition.key": 1, "definition.label": 1, "definition.unit": 1, "definition.sort_order": 1 } },
      ]),
      ExchangeRate.findOne().sort({ updated_at: -1 }).lean(),
    ]);

    const categoryIds = new Set(products.map((product) => String(product.categories?.[0]?._id || "")).filter(Boolean));
    if (categoryIds.size > 1) throw StatusError.badRequest("Choose products from the same category to compare relevant specifications.");

    const currency = req.body?.currency || "INR";
    const rate = rates?.rates?.get?.(currency) ?? rates?.rates?.[currency] ?? 1;
    const docs = ids.map((id) => products.find((product) => String(product._id) === id)).filter(Boolean).map((product) => {
      const productVariations = variations.filter((variation) => String(variation.product_id) === String(product._id)).map((variation) => {
        const regular = Number(variation.regular_price || 0) * rate;
        const sale = variation.sale_price != null ? Number(variation.sale_price) * rate : null;
        return { ...variation, converted_regular_price: regular, converted_price: sale != null && sale < regular ? sale : regular };
      });
      const resource = new ProductResource({ ...product, variations: productVariations }).exec();
      const regular = Number(product.regular_price || 0) * rate;
      const sale = product.sale_price != null ? Number(product.sale_price) * rate : null;
      const selling = sale != null && sale < regular ? sale : regular;
      return {
        ...resource,
        converted_regular_price: regular,
        converted_price: selling,
        discount_percent: regular > selling ? ((regular - selling) / regular) * 100 : 0,
        avg_rating: product.avg_rating || 0,
        total_reviews: product.total_reviews || 0,
        specifications: specificationRows.filter((row) => String(row.product_id) === String(product._id)),
      };
    });

    res.status(200).json({ status: "success", message: "Comparison fetched successfully", data: { docs, max_products: 4 } });
  } catch (error) {
    next(error);
  }
};
