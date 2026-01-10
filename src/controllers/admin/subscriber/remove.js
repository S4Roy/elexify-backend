import Subscriber from "../../../models/Subscriber.js";
import { StatusError } from "../../../config/index.js";
import SubscriberResource from "../../../resources/SubscriberResource.js";

/**
 * Delete Subscriber
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Subscriber ID is required"));
    }

    // Find the existing rating
    const rating = await Subscriber.findById(_id).exec();
    if (!rating) {
      throw StatusError.notFound(req.__("Subscriber not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the rating
    const uupdatedRating = await Subscriber.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Subscriber Deleted successfully"),
      data: new SubscriberResource(uupdatedRating).exec(),
    });
  } catch (error) {
    next(error);
  }
};
