import Order from "../../../../models/Order.js";

/**
 * GET /api/admin/orders/status-counts
 * Returns count of orders grouped by current statuses (dynamic).
 */
export const stats = async (req, res, next) => {
  try {
    const result = await Order.aggregate([
      {
        $match: {
          deleted_at: null,
        },
      },
      {
        $group: {
          _id: "$order_status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          order_status: "$_id",
          count: 1,
        },
      },
      {
        $sort: {
          order_status: -1, // sort by count descending; change to 1 for ascending
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Order status counts fetched successfully"),
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
