import ShippingRate from "../../../../models/ShippingRate.js";
import { StatusError } from "../../../../config/index.js";
import ShippingRateResource from "../../../../resources/ShippingRateResource.js";

export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Shipping Rate ID is required"));
    }

    const rate = await ShippingRate.findOne({ _id, deleted_at: null });
    if (!rate) {
      throw StatusError.notFound(req.__("Shipping Rate not found"));
    }

    rate.deleted_at = new Date();
    rate.deleted_by = req.auth.user_id;
    await rate.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Rate deleted successfully"),
      data: new ShippingRateResource(rate).exec(),
    });
  } catch (error) {
    next(error);
  }
};
