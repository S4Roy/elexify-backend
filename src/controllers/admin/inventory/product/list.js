import { buildProductListPipeline } from "../../../../services/inventory/product/buildProductListPipeline.js";
import mongoose from "mongoose";
import ProductSpecification from "../../../../models/ProductSpecification.js";
import Product from "../../../../models/Product.js";
import { StatusError, envs } from "../../../../config/index.js";
import ProductResource from "../../../../resources/ProductResource.js";

export const list = async (req, res, next) => {
  try {
    const {
      page = 1, limit = envs.pagination.limit,
      sort_by = "created_at", sort_order = -1,
      _id = null, all = "false",
    } = req.query;
    const { slug } = req.params;

    const options = {
      page,
      limit,
      sort: { [sort_by]: sort_order },
    };

    const { pipeline, matchFilter } = await buildProductListPipeline(req.query, slug);

    let data;
    if (all === "true") {
      let allData = await Product.find(matchFilter)
        .select("_id name slug")
        .exec();
      return res.status(201).json({
        status: "success",
        message: req.__("List fetched successfully"),
        data: allData,
      });
    }
    if (slug || _id) {
      const [productDoc] = await Product.aggregate(pipeline);
      if (!productDoc) {
        throw StatusError.notFound(req.__("Product not found"));
      }

      let productResource = new ProductResource(productDoc).exec();
      const specifications_pipeline = [
        {
          $match: {
            product_id: new mongoose.Types.ObjectId(String(productDoc._id)),
            deleted_at: null,
            value: { $ne: null },
            status: "active",
            value: { $ne: "" },
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

      const specifications = await ProductSpecification.aggregate(
        specifications_pipeline
      );
      productResource.specifications = specifications;
      data = productResource;
    } else {
      data = await Product.aggregatePaginate(
        Product.aggregate(pipeline),
        options
      );
      data.docs = await ProductResource.collection(data.docs);
    }

    res.status(200).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data,
    });
  } catch (error) {
    next(error);
  }
};
