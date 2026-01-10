import Order from "../../../models/Order.js";
import OrderResource from "../../../resources/OrderResource.js";
import mongoose from "mongoose";
import { StatusError } from "../../../config/index.js";
import { emailService } from "../../index.js";
import { envs } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";
import moment from "moment";

/**
 * details
 * Returns order details (with product/variation/media lookups) and sends order email.
 */
export const details = async (order_id) => {
  // validate and convert to ObjectId

  const orderObjectId = new mongoose.Types.ObjectId(order_id);

  // aggregation pipeline (as you provided)
  const pipeline = [
    { $match: { _id: orderObjectId } },

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
    { $unwind: { path: "$variation_doc", preserveNullAndEmptyArrays: true } },

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

    // --- REBUILD order_item (null-safe) ---
    {
      $addFields: {
        "order_items.product": {
          $cond: [
            { $ne: ["$product_doc", null] },
            {
              $mergeObjects: ["$product_doc", { images: "$product_images" }],
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
                            value: "$$val.value",
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
                            in: "$$av.name", // use the name text from attribute_values
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
    },
  ];

  // run aggregate
  const [result] = await Order.aggregate(pipeline);

  // Wrap result in resource
  const data = new OrderResource(result).exec();

  return result;
};
