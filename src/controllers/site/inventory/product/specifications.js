import mongoose from "mongoose";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Product from "../../../../models/Product.js";
import { StatusError } from "../../../../config/index.js";

export const specifications = async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      throw StatusError.badRequest("Invalid product slug");
    }

    const product = await Product.findOne({ slug, deleted_at: null }).select(
      "_id"
    );
    if (!product) {
      throw StatusError.notFound("Product not found");
    }

    const pipeline = [
      {
        $match: {
          product_id: mongoose.Types.ObjectId(String(product._id)),
          deleted_at: null,
          status: "active",
          value: { $ne: null, $ne: "" },
        },
      },
      {
        $lookup: {
          from: "specifications",
          localField: "specification_id",
          foreignField: "_id",
          as: "specification",
        },
      },
      {
        $unwind: {
          path: "$specification",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "specification.visible": true,
          "specification.status": "active",
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
          "specification._id": 1,
          "specification.key": 1,
          "specification.label": 1,
          "specification.type": 1,
          "specification.unit": 1,
          "specification.options": 1,
          "specification.visible": 1,
          "specification.required": 1,
          "specification.sort_order": 1,
        },
      },
      // you can still sort if you want; change/remove as needed
      { $sort: { "specification.sort_order": 1, created_at: -1 } },
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
