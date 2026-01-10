import City from "../../../models/City.js";
import { StatusError } from "../../../config/index.js";

/**
 * Update City status or other fields
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    // Find existing currency
    const currency = await City.findById(_id);
    if (!currency) {
      throw StatusError.notFound(req.__("City not found"));
    }

    // Prepare update data
    const updateData = {
      ...(status !== undefined && { status }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const updateState = await City.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("City updated successfully"),
      data: updateState,
    });
  } catch (error) {
    next(error);
  }
};
