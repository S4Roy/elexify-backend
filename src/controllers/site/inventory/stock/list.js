import StockTransaction from "../../../../models/StockTransaction.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import StockTransactionResource from "../../../../resources/StockTransactionResource.js";
import mongoose from "mongoose";

/**
 * Add StockTransaction
 * @param req
 * @param res
 * @param next
 */
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      product = null,
    } = req.query;
    const { slug = null } = req.params;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };

    if (product && mongoose.Types.ObjectId.isValid(product)) {
      matchFilter.product = new mongoose.Types.ObjectId(product);
    }
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      {
        $unwind: {
          path: "$product",
          preserveNullAndEmptyArrays: true,
        },
      },
      // 🔹 Lookup Category
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "product.category",
        },
      },
      {
        $unwind: {
          path: "$product.category",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔹 Lookup SEO
      {
        $lookup: {
          from: "seos",
          localField: "product.seo",
          foreignField: "_id",
          as: "product.seo",
        },
      },
      {
        $unwind: {
          path: "$product.seo",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔹 Lookup Images (Media)
      {
        $lookup: {
          from: "medias",
          localField: "product.images",
          foreignField: "_id",
          as: "product.images",
        },
      },

      // 🔹 Lookup Serial Numbers
      {
        $lookup: {
          from: "serial_numbers",
          localField: "product.serial_numbers",
          foreignField: "_id",
          as: "product.serial_numbers",
        },
      },
    ];
    let data = await StockTransaction.aggregatePaginate(
      StockTransaction.aggregate(pipeline),
      options
    );
    data.docs = await StockTransactionResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`${slug ? "Details" : "List"} fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
