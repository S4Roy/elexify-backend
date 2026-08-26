import Pincode from "../../../models/Pincode.js";
import { StatusError } from "../../../config/index.js";

// Manually add a pincode the India Post import didn't cover (newly issued,
// or previously missed) — the "include" side of include/exclude.
export const add = async (req, res, next) => {
  try {
    const { pincode, district, city_id, state_id, status, note } = req.body;

    const exists = await Pincode.findOne({ pincode });
    if (exists) {
      throw StatusError.badRequest(req.__("This pincode already exists"));
    }

    const created = await Pincode.create({
      pincode,
      district: district || null,
      city_id: city_id || null,
      state_id: state_id || null,
      country_id: 101,
      status: status || "active",
      note: note || null,
      updated_by: req.auth?.user_id || null,
    });

    res.status(201).json({
      status: "success",
      message: req.__("Pincode added successfully"),
      data: created,
    });
  } catch (error) {
    next(error);
  }
};
