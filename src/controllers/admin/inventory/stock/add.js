import Product from "../../../../models/Product.js";
import StockTransaction from "../../../../models/StockTransaction.js";
import { StatusError } from "../../../../config/index.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Stock Transaction (In/Out)
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { product, type, quantity, mrp, cost_price, selling_price, note } =
      req.body;

    // ✅ Validate product
    const existingProduct = await Product.findById(product);
    if (!existingProduct) {
      throw StatusError.badRequest("Invalid product ID");
    }

    // ✅ For stock out, check available quantity
    if (type === "out") {
      const inQty = await StockTransaction.aggregate([
        { $match: { product: existingProduct._id, type: "in" } },
        { $group: { _id: null, total: { $sum: "$quantity" } } },
      ]);
      const outQty = await StockTransaction.aggregate([
        { $match: { product: existingProduct._id, type: "out" } },
        { $group: { _id: null, total: { $sum: "$quantity" } } },
      ]);

      const totalIn = inQty[0]?.total || 0;
      const totalOut = outQty[0]?.total || 0;
      const available = totalIn - totalOut;

      if (quantity > available) {
        throw StatusError.badRequest(`Only ${available} items in stock`);
      }
    }

    // ✅ Create Stock Transaction
    const transaction = new StockTransaction({
      product,
      type,
      quantity,
      mrp: mrp || null,
      cost_price: cost_price || null,
      selling_price: selling_price || null,
      note: note || null,
      created_by: req.auth.user_id,
    });

    await transaction.save();
    // Update product stock (optional: use atomic ops for concurrency)
    const updateField =
      type === "in"
        ? {
            $inc: { current_stock: quantity },
            ...(mrp !== undefined && mrp !== null && { mrp }),
            ...(mrp !== undefined && cost_price !== null && { cost_price }),
            ...(selling_price !== undefined &&
              selling_price !== null && { selling_price }),
          }
        : {
            $inc: { current_stock: -quantity },
          };

    await Product.findByIdAndUpdate(product, updateField);

    res.status(201).json({
      status: "success",
      message: req.__("Stock transaction added successfully"),
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};
