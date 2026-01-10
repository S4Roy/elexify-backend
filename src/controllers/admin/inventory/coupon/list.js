import Coupon from "../../../../models/Coupon.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import CouponResource from "../../../../resources/CouponResource.js";
import mongoose from "mongoose";

/**
 * Coupon List / Details
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

      code = null,
      status = null,
      applicable_for = null,
      applicable_scope = null,
    } = req.query;

    const { id: paramId = null } = req.params;

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { [sort_by]: Number(sort_order) },
    };

    /* =========================
       MATCH FILTER
    ========================== */
    let matchFilter = { deleted_at: null };

    // Single coupon details
    if (paramId && mongoose.Types.ObjectId.isValid(paramId)) {
      matchFilter._id = new mongoose.Types.ObjectId(paramId);
    }

    if (code) {
      matchFilter.code = code.toUpperCase();
    }

    if (status) {
      matchFilter.status = status;
    }

    if (applicable_for) {
      matchFilter.applicable_for = applicable_for;
    }

    if (applicable_scope) {
      matchFilter.applicable_scope = applicable_scope;
    }

    if (search_key) {
      matchFilter.$or = [
        { code: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { title: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }

    /* =========================
       AGGREGATION PIPELINE
    ========================== */
    const pipeline = [
      { $match: matchFilter },

      /* =========================
     LOOKUPS FOR SCOPES
  ========================== */

      {
        $lookup: {
          from: "products",
          localField: "applicable_products",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1 } }],
          as: "applicable_products",
        },
      },

      {
        $lookup: {
          from: "categories",
          localField: "applicable_categories",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1 } }],
          as: "applicable_categories",
        },
      },

      {
        $lookup: {
          from: "brands",
          localField: "applicable_brands",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 1, name: 1, slug: 1 } }],
          as: "applicable_brands",
        },
      },

      {
        $lookup: {
          from: "product_variations",
          localField: "applicable_variations",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                sku: 1,
                combination_display: 1,
              },
            },
          ],
          as: "applicable_variations",
        },
      },
      // Optional: populate creators
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "created_by",
        },
      },
      {
        $unwind: {
          path: "$created_by",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "users",
          localField: "updated_by",
          foreignField: "_id",
          as: "updated_by",
        },
      },
      {
        $unwind: {
          path: "$updated_by",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    let data;

    /* =========================
       DETAILS VS LIST
    ========================== */
    if (paramId) {
      const result = await Coupon.aggregate(pipeline);

      if (!result.length) {
        throw StatusError.notFound(req.__("Coupon not found"));
      }

      data = new CouponResource(result[0]).exec();
    } else {
      data = await Coupon.aggregatePaginate(
        Coupon.aggregate(pipeline),
        options
      );

      data.docs = CouponResource.collection(data.docs);
    }

    /* =========================
       RESPONSE
    ========================== */
    res.status(200).json({
      status: "success",
      message: req.__(`${paramId ? "Details" : "List"} fetched successfully`),
      data,
    });
  } catch (error) {
    next(error);
  }
};
