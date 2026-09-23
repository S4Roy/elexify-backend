import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Admin — change own password (self-service, from the header menu)
 * @param req
 * @param res
 * @param next
 */
export const changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    const user_id = req.auth?.user_id;

    if (!user_id) throw StatusError.unauthorized(req.__("Invalid access token."));

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound(req.__("User not found"));

    if (!user.password) {
      throw StatusError.badRequest(
        req.__("Password change is not available for this account")
      );
    }

    const isOldPasswordValid = await generalHelper.bcryptCheck(
      old_password,
      user.password
    );
    if (!isOldPasswordValid) {
      throw StatusError.badRequest(req.__("Old password is incorrect"));
    }

    if (old_password === new_password) {
      throw StatusError.badRequest(
        req.__("New password must be different from old password")
      );
    }

    user.password = await generalHelper.bcryptMake(new_password);
    user.updated_by = user_id;
    user.updated_at = new Date();

    await user.save();

    res.status(200).json({
      status: "success",
      message: req.__("Password changed successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
