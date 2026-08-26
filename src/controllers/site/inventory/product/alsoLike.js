import mongoose from "mongoose";
import Product from "../../../../models/Product.js";
import OrderItem from "../../../../models/OrderItem.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import { dashboardHelper } from "../../../../helpers/index.js";

// "You may also like" — an Amazon-style "customers who bought this item also
// bought" rail. Ranked by real co-purchase frequency from order history
// (products that appeared in the same orders as this one), then padded out
// with bestsellers when an item has too little order history to rank on its
// own — new/low-traffic products would otherwise show an empty rail.
export const alsoLike = async (req, res, next) => {
  try {
    const { slug = null } = req.params;
    const { limit = 10, currency = "INR" } = req.query;
    if (!slug) throw StatusError.badRequest("Slug is required");

    const lim = Math.min(Number(limit) || 10, 20);

    const rates = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const rate = rates?.rates?.get(currency) ?? 1;
    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    const current = await Product.findOne({ slug, deleted_at: null }).select("_id");
    if (!current) throw StatusError.notFound("Product not found");

    // Orders containing this product -> other products bought alongside it,
    // ranked by how often that pairing occurs. Only orders that actually
    // realized revenue count as a signal (same status gate the revenue
    // dashboards use) — a cancelled/failed order isn't real co-purchase intent.
    const coPurchased = await OrderItem.aggregate([
      { $match: { product_id: current._id } },
      { $group: { _id: "$order_id" } },
      {
        $lookup: {
          from: "orders",
          let: { orderId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$orderId"] },
                deleted_at: null,
                order_status: { $nin: dashboardHelper.EXCLUDED_REVENUE_STATUSES },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "qualifying_order",
        },
      },
      { $match: { qualifying_order: { $ne: [] } } },
      {
        $lookup: {
          from: "order_items",
          let: { orderId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$order_id", "$$orderId"] },
                    { $ne: ["$product_id", current._id] },
                  ],
                },
              },
            },
            { $project: { product_id: 1 } },
          ],
          as: "items",
        },
      },
      { $unwind: "$items" },
      { $group: { _id: "$items.product_id", freq: { $sum: 1 } } },
      { $sort: { freq: -1 } },
      { $limit: lim },
    ]);

    let rankedIds = coPurchased.map((c) => c._id);

    // Pad with bestsellers (excluding the current product and anything
    // already ranked) when co-purchase history alone isn't enough.
    if (rankedIds.length < lim) {
      const fallback = await Product.find({
        _id: { $nin: [current._id, ...rankedIds] },
        deleted_at: null,
        status: "active",
        type: "simple",
      })
        .sort({ is_bestseller: -1, avg_rating: -1, created_at: -1 })
        .limit(lim - rankedIds.length)
        .select("_id");
      rankedIds = rankedIds.concat(fallback.map((f) => f._id));
    }

    if (!rankedIds.length) {
      return res.status(200).json({
        status: "success",
        message: "Fetched successfully",
        data: { docs: [] },
      });
    }

    const rankedIdStrings = rankedIds.map((id) => String(id));

    const docs = await Product.aggregate([
      { $match: { _id: { $in: rankedIds }, deleted_at: null, status: "active" } },
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $lookup: {
          from: "medias",
          localField: "images",
          foreignField: "_id",
          as: "images",
        },
      },
      {
        $addFields: {
          images: {
            $map: {
              input: { $ifNull: ["$images", []] },
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
          from: "wishlists",
          let: {
            productId: "$_id",
            userId: user_id ? new mongoose.Types.ObjectId(user_id) : null,
            guestId: guest_id || null,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product", "$$productId"] },
                    { $eq: ["$variation", null] },
                    { $eq: ["$deleted_at", null] },
                    {
                      $or: [
                        ...(user_id ? [{ $eq: ["$user", "$$userId"] }] : []),
                        ...(guest_id ? [{ $eq: ["$guest_id", "$$guestId"] }] : []),
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "wishlist",
        },
      },
      {
        $addFields: {
          wishlist: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$wishlist", []] } }, 0] },
              { $arrayElemAt: ["$wishlist", 0] },
              false,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "carts",
          let: {
            productId: "$_id",
            userId: user_id ? new mongoose.Types.ObjectId(user_id) : null,
            guestId: guest_id || null,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product", "$$productId"] },
                    { $eq: ["$variation", null] },
                    { $eq: ["$deleted_at", null] },
                    {
                      $or: [
                        ...(user_id ? [{ $eq: ["$user", "$$userId"] }] : []),
                        ...(guest_id ? [{ $eq: ["$guest_id", "$$guestId"] }] : []),
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "cart",
        },
      },
      {
        $addFields: {
          cart: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$cart", []] } }, 0] },
              { $arrayElemAt: ["$cart", 0] },
              false,
            ],
          },
        },
      },
      {
        $addFields: {
          price: {
            $cond: [{ $gt: ["$sale_price", 0] }, "$sale_price", "$regular_price"],
          },
        },
      },
      {
        $addFields: {
          converted_price: { $round: [{ $multiply: ["$price", rate] }, 2] },
          converted_regular_price: {
            $round: [{ $multiply: ["$regular_price", rate] }, 2],
          },
          discount_percent: {
            $cond: [
              { $and: [{ $gt: ["$regular_price", 0] }, { $gt: ["$sale_price", 0] }] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          { $subtract: ["$regular_price", "$sale_price"] },
                          "$regular_price",
                        ],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          currency,
          rank: { $indexOfArray: [rankedIdStrings, { $toString: "$_id" }] },
        },
      },
      { $sort: { rank: 1 } },
    ]);

    res.status(200).json({
      status: "success",
      message: "Fetched successfully",
      data: { docs },
    });
  } catch (error) {
    next(error);
  }
};
