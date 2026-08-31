import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

export const details = async (req, res, next) => {
  try {
    const { id } = req.params;
    const customer = await User.findOne({
      _id: id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    }).lean();

    if (!customer) throw StatusError.notFound(req.__("Customer not found"));

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
      },
    });
  } catch (error) {
    next(error);
  }
};
