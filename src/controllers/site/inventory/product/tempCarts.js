import TempCart from "../../../../models/TempCart.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import mongoose from "mongoose";

export const tempCarts = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Invalid access token.");
    }

    const {
      sort_by = "created_at",
      sort_order = -1,
      currency = "INR",
    } = req.query;

    const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const rate = ratesDoc?.rates?.get(currency) ?? 1;

    const matchFilter = {
      deleted_at: null,
      ...(user_id
        ? { user: new mongoose.Types.ObjectId(user_id) }
        : { guest_id }),
    };

    const pipeline = [
      { $match: matchFilter },

      {
        $lookup: {
          from: "product_variations",
          localField: "variation",
          foreignField: "_id",
          as: "variation",
        },
      },
      { $unwind: { path: "$variation", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      {
        $lookup: {
          from: "attribute_values",
          localField: "variation.attributes.value_id",
          foreignField: "_id",
          as: "attribute_values",
        },
      },

      {
        $addFields: {
          "product.name": {
            $let: {
              vars: {
                base: "$product.name",
                attrs: "$attribute_values",
              },
              in: {
                $cond: {
                  if: { $gt: [{ $size: "$$attrs" }, 0] },
                  then: {
                    $concat: [
                      "$$base",
                      " (",
                      {
                        $reduce: {
                          input: "$$attrs",
                          initialValue: "",
                          in: {
                            $cond: [
                              { $eq: ["$$value", ""] },
                              "$$this.name",
                              {
                                $concat: ["$$value", ", ", "$$this.name"],
                              },
                            ],
                          },
                        },
                      },
                      ")",
                    ],
                  },
                  else: "$$base",
                },
              },
            },
          },
        },
      },

      {
        $lookup: {
          from: "medias",
          let: { imageIds: { $ifNull: ["$variation.images", []] } },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$imageIds"] },
              },
            },
          ],
          as: "variation_images",
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "product.images",
          foreignField: "_id",
          as: "product_images",
        },
      },

      {
        $addFields: {
          images: {
            $map: {
              input: {
                $cond: {
                  if: {
                    $gt: [{ $size: { $ifNull: ["$variation_images", []] } }, 0],
                  },
                  then: "$variation_images",
                  else: "$product_images",
                },
              },
              as: "img",
              in: {
                _id: "$$img._id",
                url: { $concat: [envs.s3.BASE_URL, "$$img.url"] },
                alt: "$$img.alt",
              },
            },
          },
        },
      },

      {
        $lookup: {
          from: "categories",
          localField: "product.categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $lookup: {
          from: "seos",
          localField: "product.seo",
          foreignField: "_id",
          as: "seo",
        },
      },
      { $unwind: { path: "$seo", preserveNullAndEmptyArrays: true } },

      ...(user_id
        ? [
            {
              $lookup: {
                from: "wishlists",
                let: {
                  productId: "$product._id",
                  variationId: "$variation._id",
                  userId: new mongoose.Types.ObjectId(user_id),
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $or: [
                              { $eq: ["$product", "$$productId"] },
                              { $eq: ["$variation", "$$variationId"] },
                            ],
                          },
                          { $eq: ["$user", "$$userId"] },
                          { $eq: ["$deleted_at", null] },
                        ],
                      },
                    },
                  },
                ],
                as: "wishlist",
              },
            },
            {
              $unwind: { path: "$wishlist", preserveNullAndEmptyArrays: true },
            },
          ]
        : []),

      {
        $addFields: {
          effective_price: {
            $multiply: [{ $ifNull: ["$price", 0] }, rate],
          },
          total_price: {
            $multiply: [
              { $ifNull: ["$quantity", 0] },
              { $multiply: [{ $ifNull: ["$price", 0] }, rate] },
            ],
          },
          cart: {
            _id: "$_id",
            quantity: "$quantity",
            price: { $multiply: [{ $ifNull: ["$price", 0] }, rate] },
          },
        },
      },

      {
        $project: {
          _id: 0,
          cart: 1,
          total_price: 1,
          effective_price: 1,
          images: 1,
          categories: 1,
          seo: 1,
          wishlist: 1,
          variation: 1,
          product: 1,
        },
      },

      { $sort: { [sort_by]: sort_order } },
    ];

    const totalPipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          subtotal: {
            $sum: {
              $multiply: [
                { $ifNull: ["$quantity", 0] },
                { $multiply: [{ $ifNull: ["$price", 0] }, rate] },
              ],
            },
          },
        },
      },
    ];

    const [docs, grandTotalResult] = await Promise.all([
      TempCart.aggregate(pipeline),
      TempCart.aggregate(totalPipeline),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: {
        docs,
        subtotal: grandTotalResult[0]?.subtotal ?? 0,
        currency,
        exchange_rate: rate,
      },
    });
  } catch (error) {
    next(error);
  }
};
