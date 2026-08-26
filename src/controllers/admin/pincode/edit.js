import Pincode from "../../../models/Pincode.js";
import { StatusError } from "../../../config/index.js";

/**
 * Toggle a pincode's serviceability (include/exclude), optionally attach a
 * reason, and — for the small slice the import couldn't auto-resolve —
 * let an admin manually assign city/state.
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status, note, city_id, state_id } = req.body;

    const pincode = await Pincode.findById(_id);
    if (!pincode) {
      throw StatusError.notFound(req.__("Pincode not found"));
    }

    const updateData = {
      ...(status !== undefined && { status }),
      ...(note !== undefined && { note }),
      ...(city_id !== undefined && { city_id }),
      ...(state_id !== undefined && { state_id }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const updated = await Pincode.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true },
    );

    res.status(200).json({
      status: "success",
      message: req.__("Pincode updated successfully"),
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};
