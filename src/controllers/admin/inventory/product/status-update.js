import { StatusError } from "../../../../config/index.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ProductResource from "../../../../resources/ProductResource.js";

export const updateStatus = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    if (!_id) {
      return StatusError.badRequest(req.__("Product ID is required"));
    }
    if (typeof status !== "string" || !status.trim()) {
      return StatusError.badRequest(
        req.__('"status" must be a non-empty string')
      );
    }

    // 🔹 Update product status
    const product = await Product.findByIdAndUpdate(
      _id,
      {
        $set: {
          status,
          updated_by: req.auth.user_id,
          updated_at: new Date(),
        },
      },
      { new: true }
    );

    if (!product) {
      return StatusError.notFound(req.__("Product not found"));
    }

    // 🔹 Cascade to variations if product is variable
    if (product.type === "variable") {
      await ProductVariation.updateMany(
        { product_id: product._id, deleted_at: null },
        {
          $set: {
            status,
            updated_by: req.auth.user_id,
            updated_at: new Date(),
          },
        }
      );
    }

    return res.status(200).json({
      status: "success",
      message: "Product status updated successfully",
      data: new ProductResource(product).exec(),
    });
  } catch (err) {
    return next(err);
  }
};
