import ShippingZone from "../../../../models/ShippingZone.js";
import ShippingZoneResource from "../../../../resources/ShippingZoneResource.js";

export const add = async (req, res, next) => {
  try {
    const {
      name,
      countries = [],
      states = [],
      pincode_prefixes = [],
      is_default,
      status,
    } = req.body;

    if (is_default) {
      await ShippingZone.updateMany({ is_default: true }, { $set: { is_default: false } });
    }

    const zone = await ShippingZone.create({
      name,
      countries,
      states,
      pincode_prefixes,
      is_default: !!is_default,
      status: status || "active",
      created_by: req.auth.user_id,
    });

    res.status(201).json({
      status: "success",
      message: req.__("Shipping Zone added successfully"),
      data: new ShippingZoneResource(zone).exec(),
    });
  } catch (error) {
    next(error);
  }
};
