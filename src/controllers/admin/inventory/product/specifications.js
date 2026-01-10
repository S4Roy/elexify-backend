import mongoose from "mongoose";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Product from "../../../../models/Product.js";
import { StatusError } from "../../../../config/index.js";

export const specifications = async (req, res, next) => {
  try {
    const { _id } = req.params;
    if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
      throw new StatusError("Invalid product id", 400);
    }

    const product = await Product.findOne({ _id, deleted_at: null }).select(
      "_id"
    );
    if (!product) {
      throw new StatusError("Product not found", 404);
    }

    const pipeline = [
      {
        $match: {
          product_id: mongoose.Types.ObjectId(String(product._id)),
          deleted_at: null,
        },
      },
      {
        $lookup: {
          from: "specifications",
          localField: "specification_id",
          foreignField: "_id",
          as: "spec",
        },
      },
      {
        $unwind: {
          path: "$spec",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "spec.visible": true,
          "spec.status": "active",
        },
      },
      {
        $project: {
          _id: 1,
          product_id: 1,
          variation_id: 1,
          key: 1,
          label: 1,
          value: 1,
          unit: 1,
          value_string: 1,
          value_number: 1,
          status: 1,
          created_at: 1,
          updated_at: 1,
          "spec._id": 1,
          "spec.key": 1,
          "spec.label": 1,
          "spec.type": 1,
          "spec.unit": 1,
          "spec.options": 1,
          "spec.visible": 1,
          "spec.required": 1,
          "spec.sort_order": 1,
        },
      },
      // you can still sort if you want; change/remove as needed
      { $sort: { "spec.sort_order": 1, created_at: -1 } },
    ];

    const specifications = await ProductSpecification.aggregate(pipeline);

    res.status(200).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: { specifications },
    });
  } catch (error) {
    next(error);
  }
};
