import Subscriber from "../../../models/Subscriber.js";
import { StatusError } from "../../../config/index.js";
/**
 * Add Subscriber (allow guest)
 * @param req
 * @param res
 * @param next
 */
export const submit = async (req, res, next) => {
  try {
    const { email, source = "web" } = req.body;
    const doc = new Subscriber({
      email: email,
      ip: req?.ip || null,
      user_agent: req.get("User-Agent") || null,
      created_by: req.auth?.user_id ?? null,
    });

    await doc.save();

    res.status(201).json({
      status: "success",
      message: req.__("Subscribed successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
