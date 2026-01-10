import Country from "../../../models/Country.js";
import { StatusError } from "../../../config/index.js";

/**
 * Update Country status or other fields
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status } = req.body;

    // Find existing currency
    const currency = await Country.findById(_id);
    if (!currency) {
      throw StatusError.notFound(req.__("Country not found"));
    }

    // Prepare update data
    const updateData = {
      ...(status !== undefined && { status }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const updatedCurrency = await Country.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Country updated successfully"),
      data: updatedCurrency,
    });
  } catch (error) {
    next(error);
  }
};
