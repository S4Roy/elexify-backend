import Enquiry from "../../../models/Enquiry.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import EnquiryResource from "../../../resources/EnquiryResource.js";
import mongoose from "mongoose";

/**
 * Enquiry List
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
      _id = null,
    } = req.query;
    const { slug = null } = req.params;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { code: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { status: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },

      // 🔹 Join with users
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // 🔹 Join with products
      {
        $lookup: {
          from: "products",
          localField: "product_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      // 🔹 Join product.images with medias

      {
        $lookup: {
          from: "medias",
          localField: "product.images",
          foreignField: "_id",
          as: "product_images",
        },
      },
      // 🔹 Join with product variations (if exists)
      {
        $lookup: {
          from: "product_variations",
          localField: "variation_id",
          foreignField: "_id",
          as: "variation",
        },
      },
      { $unwind: { path: "$variation", preserveNullAndEmptyArrays: true } },

      // 🔹 Join with medias
      {
        $lookup: {
          from: "medias",
          localField: "media",
          foreignField: "_id",
          as: "media",
        },
      },

      // Optional: project only necessary fields
      {
        $project: {
          name: 1,
          email: 1,
          custom_id: 1,
          mobile: 1,
          product_name: 1,
          message: 1,
          status: 1,
          created_at: 1,

          "user._id": 1,
          "user.name": 1,
          "user.email": 1,

          "product._id": 1,
          "product.name": 1,
          product_images: 1, // ✅ now product images are included

          "variation._id": 1,
          "variation.sku": 1,

          media: 1,
        },
      },
    ];
    let data;
    if (slug) {
      pipeline.push({ $match: { slug: slug } });
    }

    data = await Enquiry.aggregatePaginate(
      Enquiry.aggregate(pipeline),
      options
    );
    data.docs = await EnquiryResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
