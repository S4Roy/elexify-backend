import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import { StatusError } from "../../../../config/index.js";
import mongoose from "mongoose";
import { zohoService, orderService } from "../../../../services/index.js";
import { derivePaymentStatus } from "../../../../helpers/order/derivePaymentStatus.js";
import { normalizeOrderStatus } from "../../../../helpers/order/normalizeOrderStatus.js";

export const updateStatus = async (req, res, next) => {
  try {
    let data = {};
    const { order_id, status, transaction_id, payment_meta } = req.body;

    const normalizedStatus = normalizeOrderStatus(status);
    if (!normalizedStatus) throw StatusError.badRequest("Unsupported order status");
    const updateFields = {
      order_status: normalizedStatus,
      payment_status: derivePaymentStatus(status),
    };
    // Only overwrite with real values — don't clobber a good value from
    // order creation with an empty one if this particular status change
    // didn't carry gateway meta.
    if (transaction_id) updateFields.transaction_id = transaction_id;
    if (payment_meta && Object.keys(payment_meta).length) {
      updateFields.payment_meta = payment_meta;
    }

    // Find and update the order by external ID
    const currentOrder = await Order.findOne({ id: String(order_id) });
    const orderDoc = currentOrder && await orderService.transitionOrder({
      orderId: currentOrder._id,
      orderStatus: updateFields.order_status,
      paymentStatus: updateFields.payment_status,
      set: Object.fromEntries(Object.entries(updateFields).filter(([key]) => !["order_status", "payment_status"].includes(key))),
    });

    if (!orderDoc) {
      throw new StatusError(404, "Order not found");
    }

    // Stamp paid_at the first time this order flips to paid — the
    // `paid_at: null` filter makes this a no-op on every later status
    // change, so the original payment moment is never overwritten.
    if (updateFields.payment_status === "paid") {
      await Order.updateOne(
        { _id: orderDoc._id, paid_at: null },
        { $set: { paid_at: new Date() } }
      );
    }

    if (orderDoc.order_status === "processing") {
      const matchFilter = { deleted_at: null };
      matchFilter._id = new mongoose.Types.ObjectId(orderDoc?._id);

      const pipeline = [
        { $match: matchFilter },

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

        // Lookup order items
        {
          $lookup: {
            from: "order_items",
            localField: "_id",
            foreignField: "order_id",
            as: "order_items",
          },
        },
      ];

      // If details view, enrich with address, product, and media
      pipeline.push(
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

        // Expand order_items to get product info
        { $unwind: { path: "$order_items", preserveNullAndEmptyArrays: true } },
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
        {
          $lookup: {
            from: "medias",
            localField: "product_doc.images",
            foreignField: "_id",
            as: "product_images",
          },
        },
        {
          $addFields: {
            "order_items.product": {
              $mergeObjects: ["$product_doc", { images: "$product_images" }],
            },
          },
        },
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
      let order = result[0];

      const zohoData = {
        customer_id: order.user.zoho_customer_id,
        reference_number: `${order.id}`,
        salesperson_name: "Subhankar",
        date: new Date().toISOString().split("T")[0],
        line_items: order.order_items.map((item) => ({
          item_id: item.product.sku,
          name: item.product.name,
          rate: item.unit_price,
          quantity: item.quantity,
        })),
      };

      console.log(zohoData);

      // data.listCustomers = await zohoService.listCustomers();
      data.invoiceResponse = await zohoService.createInvoice(zohoData);
      console.log("Zoho Invoice Response:", data.invoiceResponse);
    }
    return res.status(200).json({
      status: "success",
      message: "Order status updated",
      data: {
        ...data,
        order_id: orderDoc.id,
        order_status: orderDoc.order_status,
      },
    });
  } catch (error) {
    next(error);
  }
};
