import State from "../../../models/State.js";
import { StatusError } from "../../../config/index.js";

/**
 * Update State status or other fields
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    // Find existing currency
    const currency = await State.findById(_id);
    if (!currency) {
      throw StatusError.notFound(req.__("State not found"));
    }

    // Prepare update data
    const updateData = {
      ...(status !== undefined && { status }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const updateState = await State.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("State updated successfully"),
      data: updateState,
    });
  } catch (error) {
    next(error);
  }
};
