import Cart from "../../../../models/Cart.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import Address from "../../../../models/Address.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import { shippingService } from "../../../../services/index.js";
import mongoose from "mongoose";

export const carts = async (req, res, next) => {
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
      address_id = null,
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

      // 🔹 Variation
      {
        $lookup: {
          from: "product_variations",
          localField: "variation",
          foreignField: "_id",
          as: "variation",
        },
      },
      { $unwind: { path: "$variation", preserveNullAndEmptyArrays: true } },

      // 🔹 Product
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      // 🔹 Attributes (for name)
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

      // 🔹 Images
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

      // 🔹 Category & SEO
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

      // 🔹 Wishlist (only for user)
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

      // 🔥 FIXED PRICING (IMPORTANT)
      {
        $addFields: {
          effective_price: {
            $multiply: [{ $ifNull: ["$discounted_price", "$price"] }, rate],
          },
          total_price: {
            $multiply: [
              { $ifNull: ["$quantity", 0] },
              {
                $multiply: [{ $ifNull: ["$discounted_price", "$price"] }, rate],
              },
            ],
          },
          cart: {
            _id: "$_id",
            quantity: "$quantity",
            price: {
              $multiply: [{ $ifNull: ["$discounted_price", "$price"] }, rate],
            },
            discount_percent: { $ifNull: ["$discount_percent", null] },
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

    // 🔥 FIXED SUBTOTAL
   const totalPipeline = [
  { $match: matchFilter },
  {
    $group: {
      _id: null,
      subtotal: {
        $sum: {
          $multiply: [
            { $ifNull: ["$quantity", 0] },
            { $multiply: [{ $ifNull: ["$discounted_price", "$price"] }, rate] },
          ],
        },
      },
      total_discount: {
        $sum: {
          $multiply: [
            { $ifNull: ["$quantity", 0] },
            {
              $multiply: [
                { $max: [{ $subtract: ["$price", { $ifNull: ["$discounted_price", "$price"] }] }, 0] },
                rate,
              ],
            },
          ],
        },
      },
    },
  },
];

    const [docs, grandTotalResult] = await Promise.all([
      Cart.aggregate(pipeline),
      Cart.aggregate(totalPipeline),
    ]);

    const subtotal = grandTotalResult[0]?.subtotal ?? 0;

    // 🔹 Optional dynamic shipping + estimated delivery, once an address is selected (checkout)
    let shipping = null;
    let estimated_delivery = null;

    if (address_id) {
      const address = await Address.findOne({
        _id: address_id,
        deleted_at: null,
        ...(user_id ? { user: user_id } : {}),
      }).lean();

      if (address) {
        const rawCarts = await Cart.find(matchFilter)
          .populate({ path: "product", select: "weight shipping_class stock_quantity status" })
          .populate({ path: "variation", select: "weight shipping_class stock_quantity status" })
          .lean();

        const shippingItems = rawCarts
          .filter((c) => c.product)
          .map((c) => {
            const source = c.variation || c.product;
            return {
              shipping_class: source.shipping_class || null,
              weight: source.weight || 0,
              quantity: c.quantity,
            };
          });

        const isAvailable = rawCarts.every((c) => {
          const source = c.variation || c.product;
          return (
            source &&
            source.status !== "inactive" &&
            (source.stock_quantity == null || source.stock_quantity >= c.quantity)
          );
        });

        const rateResult = await shippingService.calculateShippingRate({
          items: shippingItems,
          address: { country: address.country, state: address.state, postcode: address.postcode },
          orderSubtotal: subtotal,
        });

        shipping = { amount: rateResult.amount, zone: rateResult.zone?.name ?? null };
        estimated_delivery = await shippingService.calculateDeliveryEstimate({
          min_delivery_days: rateResult.min_delivery_days,
          max_delivery_days: rateResult.max_delivery_days,
          isAvailable,
        });
      }
    }

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: {
        docs,
        subtotal,
        total_discount: grandTotalResult[0]?.total_discount ?? 0,
        currency,
        exchange_rate: rate,
        shipping,
        estimated_delivery,
      },
    });
  } catch (error) {
    next(error);
  }
};
