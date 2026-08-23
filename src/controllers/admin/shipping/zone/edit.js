import ShippingZone from "../../../../models/ShippingZone.js";
import { StatusError } from "../../../../config/index.js";
import ShippingZoneResource from "../../../../resources/ShippingZoneResource.js";

export const edit = async (req, res, next) => {
  try {
    const { _id, name, countries, states, pincode_prefixes, is_default, status } = req.body;

    const zone = await ShippingZone.findOne({ _id, deleted_at: null });
    if (!zone) {
      throw StatusError.notFound(req.__("Shipping Zone not found"));
    }

    if (is_default) {
      await ShippingZone.updateMany(
        { _id: { $ne: _id }, is_default: true },
        { $set: { is_default: false } }
      );
    }

    Object.assign(zone, {
      ...(name !== undefined && { name }),
      ...(countries !== undefined && { countries }),
      ...(states !== undefined && { states }),
      ...(pincode_prefixes !== undefined && { pincode_prefixes }),
      ...(is_default !== undefined && { is_default }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    await zone.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Zone updated successfully"),
      data: new ShippingZoneResource(zone).exec(),
    });
  } catch (error) {
    next(error);
  }
};
