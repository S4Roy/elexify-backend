import ShippingZone from "../../../../models/ShippingZone.js";
import ShippingRate from "../../../../models/ShippingRate.js";
import { StatusError } from "../../../../config/index.js";
import ShippingZoneResource from "../../../../resources/ShippingZoneResource.js";

export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Shipping Zone ID is required"));
    }

    const zone = await ShippingZone.findOne({ _id, deleted_at: null });
    if (!zone) {
      throw StatusError.notFound(req.__("Shipping Zone not found"));
    }

    const inUse = await ShippingRate.exists({ zone: _id, deleted_at: null });
    if (inUse) {
      throw StatusError.conflict(
        req.__("This zone has shipping rates configured and cannot be deleted")
      );
    }

    zone.deleted_at = new Date();
    zone.deleted_by = req.auth.user_id;
    await zone.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Zone deleted successfully"),
      data: new ShippingZoneResource(zone).exec(),
    });
  } catch (error) {
    next(error);
  }
};
