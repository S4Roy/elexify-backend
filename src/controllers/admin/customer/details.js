import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import UserResource from "../../../resources/UserResource.js";

/**
 * Admin — Customer List / Details
 * @param req
 * @param res
 * @param next
 */
export const details = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      status,
      _id,
    } = req.query;

    const options = {
      page,
      limit,
      sort: { [sort_by]: sort_order },
    };

    // ── Single customer detail ─────────────────────────────────────────────────
    if (_id) {
      const customer = await User.findOne({
        _id,
        role: { $in: ["user", "customer"] },
        deleted_at: null,
      });

      if (!customer) {
        throw StatusError.notFound(req.__("Customer not found"));
      }

      return res.status(200).json({
        status: "success",
        message: req.__("Customer fetched successfully"),
        data: new UserResource(customer).exec(),
      });
    }

    // ── Customer list ─────────────────────────────────────────────────────────
    const matchFilter = {
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    };

    if (status) {
      matchFilter.status = status;
    }

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { email: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { mobile: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }

    const pipeline = [
      { $match: matchFilter },
      // Join orders count
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "user_id",
          as: "orders",
        },
      },
      {
        $addFields: {
          total_orders: { $size: "$orders" },
        },
      },
      {
        $project: {
          orders: 0, // remove raw orders array
          password: 0,
          reset_token: 0,
        },
      },
    ];

    const data = await User.aggregatePaginate(
      User.aggregate(pipeline),
      options,
    );

    data.docs = await UserResource.collection(data.docs);

    return res.status(200).json({
      status: "success",
      message: req.__("Customers fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
