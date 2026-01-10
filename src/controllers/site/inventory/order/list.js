import Order from "../../../../models/Order.js";
import { StatusError, envs } from "../../../../config/index.js";
import mongoose from "mongoose";
import OrderResource from "../../../../resources/OrderResource.js";

export const list = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;

    const {
      page = 1,
      limit = envs.pagination.limit,
      order_status = "",
      search_key = "",
      sort_by = "id",
      sort_order = -1,
      _id = null,
    } = req.query;

    const { slug = null } = req.params;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sort_by]: parseInt(sort_order) },
    };

    const matchFilter = {
      deleted_at: null,
    };
    if (req.auth.role == "customer") {
      matchFilter.user = new mongoose.Types.ObjectId(user_id);
    }

    if (slug) matchFilter.slug = slug;
    if (_id) matchFilter._id = new mongoose.Types.ObjectId(_id);
    if (order_status) matchFilter.order_status = order_status;
    if (search_key) {
      matchFilter.$or = [
        { id: { $regex: search_key, $options: "i" } },
        { transaction_id: { $regex: search_key, $options: "i" } },
        { order_status: { $regex: search_key, $options: "i" } },
      ];
    }

    const pipeline = [{ $match: matchFilter }];

    let data;
    if (slug || _id) {
      pipeline.push(
        // Lookup user
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

        // Billing address
        {
          $lookup: {
            from: "addresses",
            localField: "billing_address",
            foreignField: "_id",
            as: "billing_address",
          },
        },
        {
          $unwind: {
            path: "$billing_address",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "countries",
            localField: "billing_address.country",
            foreignField: "id",
            as: "billing_address.country",
          },
        },
        {
          $unwind: {
            path: "$billing_address.country",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "states",
            localField: "billing_address.state",
            foreignField: "id",
            as: "billing_address.state",
          },
        },
        {
          $unwind: {
            path: "$billing_address.state",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "cities",
            localField: "billing_address.city",
            foreignField: "id",
            as: "billing_address.city",
          },
        },
        {
          $unwind: {
            path: "$billing_address.city",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Shipping address
        {
          $lookup: {
            from: "addresses",
            localField: "shipping_address",
            foreignField: "_id",
            as: "shipping_address",
          },
        },
        {
          $unwind: {
            path: "$shipping_address",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $lookup: {
            from: "countries",
            localField: "shipping_address.country",
            foreignField: "id",
            as: "shipping_address.country",
          },
        },
        {
          $unwind: {
            path: "$shipping_address.country",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "states",
            localField: "shipping_address.state",
            foreignField: "id",
            as: "shipping_address.state",
          },
        },
        {
          $unwind: {
            path: "$shipping_address.state",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "cities",
            localField: "shipping_address.city",
            foreignField: "id",
            as: "shipping_address.city",
          },
        },
        {
          $unwind: {
            path: "$shipping_address.city",
            preserveNullAndEmptyArrays: true,
          },
        },
        // Lookup order items
        {
          $lookup: {
            from: "order_items",
            localField: "_id",
            foreignField: "order_id",
            as: "order_items",
          },
        },

        // Expand order_items to process product + image lookups
        { $unwind: { path: "$order_items", preserveNullAndEmptyArrays: true } },

        // Lookup product in order_item
        {
          $lookup: {
            from: "products",
            localField: "order_items.product_id",
            foreignField: "_id",
            as: "product_doc",
          },
        },
        {
          $unwind: {
            path: "$product_doc",
            preserveNullAndEmptyArrays: true,
          },
        },

        // Lookup images for product
        {
          $lookup: {
            from: "medias",
            localField: "product_doc.images",
            foreignField: "_id",
            as: "product_images",
          },
        },

        // --- VARIATION lookups (fix: use variation_id) ---
        {
          $lookup: {
            from: "product_variations",
            localField: "order_items.variation_id", // ✅ FIXED
            foreignField: "_id",
            as: "variation_doc",
          },
        },
        {
          $unwind: { path: "$variation_doc", preserveNullAndEmptyArrays: true },
        },

        // variation images
        {
          $lookup: {
            from: "medias",
            localField: "variation_doc.images",
            foreignField: "_id",
            as: "variation_images",
          },
        },

        // variation attribute values (optional)
        {
          $lookup: {
            from: "attribute_values",
            localField: "variation_doc.attributes.value_id",
            foreignField: "_id",
            as: "variation_attr_values",
          },
        },
        // attribute definitions (optional)
        {
          $lookup: {
            from: "attributes",
            localField: "variation_attr_values.attribute_id",
            foreignField: "_id",
            as: "variation_attr_defs",
          },
        },
        // --- CUSTOMIZATION lookup ---
        {
          $lookup: {
            from: "product_customizations",
            localField: "order_items.customization_id",
            foreignField: "_id",
            as: "customization_doc",
          },
        },
        {
          $unwind: {
            path: "$customization_doc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "attribute_values",
            localField: "customization_doc.mukhi_items.value_id",
            foreignField: "_id",
            as: "customization_mukhi_values",
          },
        },
        {
          $lookup: {
            from: "attribute_values",
            localField: "customization_doc.combination_type",
            foreignField: "_id",
            as: "customization_combination",
          },
        },
        {
          $unwind: {
            path: "$customization_combination",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "attribute_values",
            localField: "customization_doc.design_variation",
            foreignField: "_id",
            as: "customization_design",
          },
        },
        {
          $unwind: {
            path: "$customization_design",
            preserveNullAndEmptyArrays: true,
          },
        },

        // --- REBUILD order_item (null-safe) ---
        {
          $addFields: {
            "order_items.product": {
              $cond: [
                { $ne: ["$product_doc", null] },
                {
                  $mergeObjects: [
                    "$product_doc",
                    { images: "$product_images" },
                  ],
                },
                null,
              ],
            },
            "order_items.variation": {
              $cond: [
                { $ne: ["$variation_doc", null] },
                {
                  $mergeObjects: [
                    "$variation_doc",
                    {
                      images: "$variation_images",
                      // OPTIONAL: pack attribute {name, value}
                      attributes_resolved: {
                        $cond: [
                          { $gt: [{ $size: "$variation_attr_values" }, 0] },
                          {
                            $map: {
                              input: "$variation_attr_values",
                              as: "val",
                              in: {
                                name: {
                                  $let: {
                                    vars: {
                                      idx: {
                                        $indexOfArray: [
                                          {
                                            $map: {
                                              input: "$variation_attr_defs",
                                              as: "a",
                                              in: "$$a._id",
                                            },
                                          },
                                          "$$val.attribute_id",
                                        ],
                                      },
                                    },
                                    in: {
                                      $cond: [
                                        { $gte: ["$$idx", 0] },
                                        {
                                          $arrayElemAt: [
                                            "$variation_attr_defs.name",
                                            "$$idx",
                                          ],
                                        },
                                        null,
                                      ],
                                    },
                                  },
                                },
                                value: "$$val.name",
                              },
                            },
                          },
                          [],
                        ],
                      },
                    },
                  ],
                },
                null,
              ],
            },
            // Choose images to display for the line item
            "order_items.display_images": {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$variation_images", []] } }, 0] },
                "$variation_images",
                "$product_images",
              ],
            },
            "order_items.display_name": {
              $let: {
                vars: {
                  base: "$product_doc.name",
                  attrs: { $ifNull: ["$variation_attr_values", []] },
                },
                in: {
                  $cond: [
                    { $gt: [{ $size: "$$attrs" }, 0] },
                    {
                      $concat: [
                        "$$base",
                        " | ",
                        {
                          $reduce: {
                            input: {
                              $map: {
                                input: "$$attrs",
                                as: "av",
                                in: "$$av.name", // use the value text from attribute_values
                              },
                            },
                            initialValue: "",
                            in: {
                              $cond: [
                                { $eq: ["$$value", ""] },
                                "$$this",
                                { $concat: ["$$value", " | ", "$$this"] },
                              ],
                            },
                          },
                        },
                      ],
                    },
                    "$$base",
                  ],
                },
              },
            },
            // ----------------------------
            // CUSTOMIZATION (if exists)
            // ----------------------------
            "order_items.customization": {
              $cond: [
                { $ne: ["$customization_doc", null] },
                {
                  _id: "$customization_doc._id",

                  combination_type: {
                    _id: "$customization_combination._id",
                    name: "$customization_combination.name",
                  },

                  design_variation: {
                    _id: "$customization_design._id",
                    name: "$customization_design.name",
                  },

                  making_charge: "$customization_doc.making_charge",
                  total_beads: "$customization_doc.total_beads",
                  total_price: "$customization_doc.total_price",

                  mukhi_items: {
                    $map: {
                      input: "$customization_doc.mukhi_items",
                      as: "mi",
                      in: {
                        mukhi: {
                          $let: {
                            vars: {
                              idx: {
                                $indexOfArray: [
                                  "$customization_mukhi_values._id",
                                  "$$mi.value_id",
                                ],
                              },
                            },
                            in: {
                              $arrayElemAt: [
                                "$customization_mukhi_values.name",
                                "$$idx",
                              ],
                            },
                          },
                        },
                        bead_size: "$$mi.bead_size",
                        quantity: "$$mi.quantity",
                        unit_price: "$$mi.unit_price",
                        total_price: "$$mi.total_price",
                      },
                    },
                  },
                },
                null,
              ],
            },
          },
        },

        // Group all order_items back
        {
          $group: {
            _id: "$_id",
            doc: { $first: "$$ROOT" },
            order_items: { $push: "$order_items" },
          },
        },
        {
          $addFields: {
            "doc.order_items": "$order_items",
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" },
        }
      );
      const result = await Order.aggregate(pipeline);
      if (!result.length) throw StatusError.notFound(req.__("Order not found"));
      data = new OrderResource(result[0]).exec();
    } else {
      const agg = Order.aggregate(pipeline);
      const result = await Order.aggregatePaginate(agg, options);
      result.docs = await OrderResource.collection(result.docs);

      data = result;
    }

    res.status(200).json({
      status: "success",
      message: req.__(
        `${slug || _id ? "Details" : "List"} fetched successfully`
      ),
      data,
    });
  } catch (error) {
    next(error);
  }
};
