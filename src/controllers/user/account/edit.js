import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Edit User
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { first_name, last_name, phone, email, password } = req.body;

    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const user = await User.findOne({
      _id: user_id,
      deleted_at: null,
    });

    if (!user) throw StatusError.notFound("Profile not found");

    if (first_name) user.first_name = first_name;
    if (last_name) user.last_name = last_name;

    if (first_name && last_name) {
      user.name = `${first_name} ${last_name}`;
    }
    if (phone) user.phone = phone;
    if (email) user.email = email;
    if (password) user.password = await generalHelper.bcryptMake(password);

    user.updated_by = user_id;
    user.updated_at = Date.now();

    await user.save();

    res.status(200).json({
      status: "success",
      message: req.__("Profile updated successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
