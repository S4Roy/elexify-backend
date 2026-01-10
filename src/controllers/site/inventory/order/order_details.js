import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import { StatusError } from "../../../../config/index.js";
import OrderPickupDetailsResource from "../../../../resources/OrderPickupDetailsResource.js";

export const order_details = async (req, res, next) => {
  try {
    const { _id = null } = req.query;

    // Validate ID
    if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
      throw new StatusError(400, "Invalid order ID");
    }

    const orderObjectId = new mongoose.Types.ObjectId(_id);

    // Step 1: Get the order
    const order = await Order.findById(orderObjectId)
      .populate("user")
      .populate("shipping_address")
      .populate("billing_address");

    if (!order) {
      throw new StatusError(404, "Order not found");
    }

    // Step 2: Fetch all order items linked to this order
    const orderItems = await OrderItem.aggregate([
      { $match: { order_id: order._id } },

      {
        $lookup: {
          from: "products",
          localField: "product_id",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },

      {
        $lookup: {
          from: "medias",
          localField: "productInfo.images",
          foreignField: "_id",
          as: "imagesData",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "productInfo.categories",
          foreignField: "_id",
          as: "categoryData",
        },
      },

      {
        $project: {
          product_id: "$product_id",
          order_id: "$order_id",
          sku: "$productInfo.sku",
          name: "$productInfo.name",
          slug: "$productInfo.slug",
          shipping: "$productInfo.shipping",
          unit_price: "$unit_price",
          total_price: "$total_price",
          ordered_quantity: "$quantity",
          packed_quantity: { $literal: 0 }, // Optional: Replace if you track packing separately
          current_stock: "$productInfo.stock_quantity",
          images: {
            $map: {
              input: "$imagesData",
              as: "img",
              in: {
                _id: "$$img._id",
                url: "$$img.url",
                alt: "$$img.alt",
              },
            },
          },
          categories: {
            $map: {
              input: "$categoryData",
              as: "cat",
              in: {
                _id: "$$cat._id",
                name: "$$cat.name",
                slug: "$$cat.slug",
              },
            },
          },
        },
      },
    ]);

    // Step 3: Wrap in your resource formatter
    const data = new OrderPickupDetailsResource({
      id: order.id,
      _id: order._id,
      user: order.user,
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      payment_status: order.payment_status,
      order_status: order.order_status,
      total_amount: order.total_amount,
      grand_total: order.grand_total,
      created_at: order.created_at,
      order_items: orderItems,
    }).exec();

    res.status(200).json({
      status: "success",
      message: req.__(`Details fetched successfully`),
      data,
    });
  } catch (error) {
    console.error("❌ order_details error:", error.message);
    next(error);
  }
};
