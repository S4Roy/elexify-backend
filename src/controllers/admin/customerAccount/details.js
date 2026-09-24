import User from "../../../models/User.js";
import Order from "../../../models/Order.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

// Orders that never became a sale don't count towards lifetime value.
const NON_REVENUE_STATUSES = ["cancelled", "failed", "returned"];

// Lifetime order stats plus the latest few orders for the customer header.
const orderSummary = async (userId) => {
  const [stats] = await Order.aggregate([
    { $match: { user: userId, deleted_at: null } },
    {
      $group: {
        _id: null,
        order_count: { $sum: 1 },
        total_spent: { $sum: { $cond: [{ $in: ["$order_status", NON_REVENUE_STATUSES] }, 0, "$grand_total"] } },
        revenue_orders: { $sum: { $cond: [{ $in: ["$order_status", NON_REVENUE_STATUSES] }, 0, 1] } },
        first_order_at: { $min: "$created_at" },
        last_order_at: { $max: "$created_at" },
      },
    },
  ]);
  const recent = await Order.find({ user: userId, deleted_at: null })
    .sort({ created_at: -1 })
    .limit(5)
    .select("id created_at order_status payment_status payment_method grand_total currency total_items")
    .lean();
  return {
    stats: {
      order_count: stats?.order_count ?? 0,
      total_spent: Math.round((stats?.total_spent ?? 0) * 100) / 100,
      average_order_value: stats?.revenue_orders ? Math.round((stats.total_spent / stats.revenue_orders) * 100) / 100 : 0,
      first_order_at: stats?.first_order_at ?? null,
      last_order_at: stats?.last_order_at ?? null,
    },
    recent_orders: recent,
  };
};

export const details = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = await User.findOne({
      _id: id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    }).lean();

    if (!customer) throw StatusError.notFound(req.__("Customer not found"));
    const { stats, recent_orders } = await orderSummary(customer._id);

    res.status(200).json({
      status: "success",
      message: req.__("Customer details fetched successfully"),
      data: {
        _id: customer._id,
        name: customer.name,
        email: customer.email || null,
        email_verified: !!customer.email_verified_at,
        mobile: customer.mobile || null,
        phone_code: customer.phone_code || null,
        mobile_verified: !!customer.mobile_verified_at,
        pending_email: customer.pending_email
          ? generalHelper.maskEmail(customer.pending_email)
          : null,
        pending_mobile: customer.pending_mobile
          ? generalHelper.maskMobile(customer.pending_mobile, customer.pending_phone_code)
          : null,
        dob: customer.dob || null,
        gender: customer.gender || null,
        profile_image: customer.profile_image || null,
        status: customer.status,
        created_at: customer.created_at,
        updated_at: customer.updated_at,
        stats,
        recent_orders,
      },
    });
  } catch (error) {
    next(error);
  }
};
