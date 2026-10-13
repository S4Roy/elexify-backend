import Subscriber from "../../../models/Subscriber.js";
import { StatusError } from "../../../config/index.js";

/**
 * Update Subscriber status or other fields
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    // Only manage live subscriber records
    const subscriber = await Subscriber.findOne({ _id, deleted_at: null });
    if (!subscriber) {
      throw StatusError.notFound(req.__("Subscriber not found"));
    }

    // Prepare update data
    const updateData = {
      ...(status !== undefined && { status }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const updatedRating = await Subscriber.findOneAndUpdate(
      { _id, deleted_at: null },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedRating) throw StatusError.notFound(req.__("Subscriber not found"));

    res.status(200).json({
      status: "success",
      message: req.__("Subscriber updated successfully"),
      data: updatedRating,
    });
  } catch (error) {
    next(error);
  }
};
