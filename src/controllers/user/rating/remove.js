import Address from "../../../models/Address.js";
import { StatusError } from "../../../config/index.js";

/**
 * Edit Address
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Address ID is required"));
    }

    // Find the existing address
    const address = await Address.findById(_id).exec();
    if (!address) {
      throw StatusError.notFound(req.__("Address not found"));
    }

    // Prepare update data
    const updateData = {
      deleted_by: req.auth.user_id,
      deleted_at: new Date(),
    };

    // Update the address
    const updateAddress = await Address.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Address Deleted successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
