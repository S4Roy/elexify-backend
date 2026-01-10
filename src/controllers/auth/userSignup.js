import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";

/**
 * Customer Signup
 */
export const userSignup = async (req, res, next) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    const name = first_name + " " + last_name;
    // Check if email already exists
    const existingUser = await User.findOne({
      email,
      deleted_at: null,
    }).exec();

    if (existingUser) {
      throw StatusError.conflict(req.__("Email is already registered"));
    }

    // Hash password
    const hashedPassword = await generalHelper.bcryptMake(password);

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "customer",
      status: "active",
    });

    // Generate token
    const token = await userService.generateTokens({
      user_id: newUser._id,
      email: newUser.email,
      role: newUser.role,
    });

    // Success response
    return res.status(201).json({
      status: "success",
      message: req.__("Signup successful! Welcome aboard."),
      data: {
        user: new UserResource(newUser).exec(),
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};
