import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import mongoose from "mongoose";

/**
 * Get User
 * @param req
 * @param res
 * @param next
 */
export const details = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const user = await User.findOne({
      _id: new mongoose.Types.ObjectId(user_id),
    });
    if (!user) {
      throw new StatusError(404, "Details not found");
    }
    const [first_name, ...rest] = user.name.trim().split(" ");
    const last_name = rest.join(" ") || "";

    res.status(200).json({
      status: "success",
      message: req.__("Details fetched successfully"),
      data: {
        email: user.email,
        first_name,
        last_name,
      },
    });
  } catch (error) {
    next(error);
  }
};
