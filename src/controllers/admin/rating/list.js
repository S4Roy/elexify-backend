import { sourceCondition, sourceExpression, legacyReviewIds } from '../../../services/legacyImport/filter.js';
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
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      _id = null,
      status = null,
      rating = null,
    } = req.query;
    const { slug = null } = req.params;

    const importSource = req.query.import_source;
    if (importSource && !['backup', 'other'].includes(importSource)) throw StatusError.badRequest('Invalid import source filter');
    let importedReviewIds = [];
    try { importedReviewIds = await legacyReviewIds(); }
    catch {
      if (importSource) throw StatusError.badRequest('The original backup must be available to identify reviews from the earlier import.');
    }
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = { deleted_at: null };

    if (importSource) matchFilter.$and = [sourceCondition(importSource, importedReviewIds)];
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { code: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { status: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }
    if (rating) {
      matchFilter.rating = {
        $in: rating.split(",").map((r) => Number(r)),
      };
    }
    const pipeline = [
      { $match: matchFilter },
      { $addFields: { imported_from_backup: sourceExpression(importedReviewIds) } },

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
          imported_from_backup: 1,
          rating: 1,
          description: 1,
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

    data = await Rating.aggregatePaginate(Rating.aggregate(pipeline), options);
    data.docs = await RatingResource.collection(data.docs);

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
