import ShippingRate from "../../../../models/ShippingRate.js";
import { StatusError } from "../../../../config/index.js";
import ShippingRateResource from "../../../../resources/ShippingRateResource.js";

export const edit = async (req, res, next) => {
  try {
    const {
      _id,
      zone,
      shipping_class,
      flat_rate,
      per_kg_rate,
      free_weight_kg,
      free_shipping_min_order_value,
      min_delivery_days,
      max_delivery_days,
      status,
    } = req.body;

    const rate = await ShippingRate.findOne({ _id, deleted_at: null });
    if (!rate) {
      throw StatusError.notFound(req.__("Shipping Rate not found"));
    }

    Object.assign(rate, {
      ...(zone !== undefined && { zone }),
      ...(shipping_class !== undefined && { shipping_class: shipping_class || null }),
      ...(flat_rate !== undefined && { flat_rate }),
      ...(per_kg_rate !== undefined && { per_kg_rate }),
      ...(free_weight_kg !== undefined && { free_weight_kg }),
      ...(free_shipping_min_order_value !== undefined && {
        free_shipping_min_order_value: free_shipping_min_order_value ?? null,
      }),
      ...(min_delivery_days !== undefined && { min_delivery_days }),
      ...(max_delivery_days !== undefined && { max_delivery_days }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    await rate.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Rate updated successfully"),
      data: new ShippingRateResource(rate).exec(),
    });
  } catch (error) {
    next(error);
  }
};
