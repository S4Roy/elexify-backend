import Currency from "../../../models/Currency.js";
import { StatusError } from "../../../config/index.js";

/**
 * Update Currency status or other fields
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    // Find existing currency
    const currency = await Currency.findById(_id);
    if (!currency) {
      throw StatusError.notFound(req.__("Currency not found"));
    }

    // Prepare update data
    const updateData = {
      ...(status !== undefined && { status }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const updatedCurrency = await Currency.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Currency updated successfully"),
      data: updatedCurrency,
    });
  } catch (error) {
    next(error);
  }
};
