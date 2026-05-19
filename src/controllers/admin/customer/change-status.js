import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";

/**
 * Admin — Change Customer Status
 * @param req
 * @param res
 * @param next
 */
export const changeStatus = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    const customer = await User.findOne({
      _id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    });

    if (!customer) {
      throw StatusError.notFound(req.__("Customer not found"));
    }

    await customer.updateOne({
      status,
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    return res.status(200).json({
      status: "success",
      message: req.__(
        `Customer ${status === "active" ? "activated" : "deactivated"} successfully`,
      ),
    });
  } catch (error) {
    next(error);
  }
};
