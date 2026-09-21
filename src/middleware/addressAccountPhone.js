import User from "../models/User.js";
import { StatusError } from "../config/index.js";

// Resolve before validation so clients cannot override the account contact.
export async function addressAccountPhone(req, res, next) {
  try {
    const userId = req.auth?.user_id;
    if (!userId) throw StatusError.unauthorized("Invalid access token.");
    const user = await User.findOne({ _id: userId, deleted_at: null })
      .select("mobile phone_code email").lean();
    if (!user) throw StatusError.unauthorized("Invalid access token.");
    const phone = String(user.mobile || "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw StatusError.badRequest("Add a valid mobile number in your account settings before saving an address.");
    }
    req.body = { ...req.body, phone, phone_code: String(user.phone_code || "91"), email: user.email || null };
    next();
  } catch (error) {
    next(error);
  }
}
