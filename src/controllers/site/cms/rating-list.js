import { ratingSummary } from "../../../services/rating/summary.js";
import Rating from "../../../models/Rating.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import RatingResource from "../../../resources/RatingResource.js";
import mongoose from "mongoose";

/**
 * Rating List
 * @param req
 * @param res
 * @param next
 */
export const ratingList = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      product_id = null,
      variation_id = null,
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
    const sortField = sort_by === "rating" ? "rating" : "created_at";
    const direction = Number(sort_order) === 1 ? 1 : -1;
    const scope = {};
    if (product_id) scope.product_id = new mongoose.Types.ObjectId(product_id);
    if (variation_id) scope.variation_id = new mongoose.Types.ObjectId(variation_id);
    const matchFilter = { ...scope, deleted_at: null, status: "approved" };
    if (req.query.rating) matchFilter.rating = Number(req.query.rating);
    if (req.query.verified_purchase === true || req.query.verified_purchase === 'true') matchFilter.verified_purchase = true;
    if (req.query.with_media === true || req.query.with_media === 'true') matchFilter['media.0'] = { $exists: true };
    if (search_key) {
      const escaped = String(search_key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchFilter.$or = [{ description: { $regex: escaped, $options: 'i' } }, { title: { $regex: escaped, $options: 'i' } }];
    }
    const pipeline = [
      { $match: matchFilter },
      { $sort: { [sortField]: direction, _id: direction } },
      { $skip: (pageNumber - 1) * pageSize },
      { $limit: pageSize },

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
          title: 1,
          verified_purchase: 1,
          updated_at: 1,
          rating: 1,
          description: 1,
          status: 1,
          created_at: 1,

          "user._id": 1,
          "user.name": 1,


          "product._id": 1,
          "product.name": 1,
          product_images: 1, // ✅ now product images are included

          "variation._id": 1,
          "variation.sku": 1,

          media: 1,
        },
      },
    ];
    const [rows, totalDocs, summary] = await Promise.all([
      Rating.aggregate(pipeline), Rating.countDocuments(matchFilter), product_id || variation_id ? ratingSummary(scope) : Promise.resolve(null),
    ]);
    const docs = await RatingResource.collection(rows);
    const totalPages = Math.ceil(totalDocs / pageSize) || 1;
    res.status(201).json({
      status: "success", message: req.__("Data fetched successfully"),
      data: { docs, summary, totalDocs, page: pageNumber, limit: pageSize, totalPages,
        hasNextPage: pageNumber < totalPages, hasPrevPage: pageNumber > 1 },
    });
  } catch (error) {
    next(error);
  }
};
