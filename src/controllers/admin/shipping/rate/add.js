import ShippingRate from "../../../../models/ShippingRate.js";
import ShippingRateResource from "../../../../resources/ShippingRateResource.js";

export const add = async (req, res, next) => {
  try {
    const {
      zone,
      shipping_class = null,
      flat_rate,
      per_kg_rate,
      free_weight_kg,
      free_shipping_min_order_value,
      min_delivery_days,
      max_delivery_days,
      status,
    } = req.body;

    const rate = await ShippingRate.create({
      zone,
      shipping_class: shipping_class || null,
      flat_rate,
      per_kg_rate,
      free_weight_kg,
      free_shipping_min_order_value: free_shipping_min_order_value ?? null,
      min_delivery_days,
      max_delivery_days,
      status: status || "active",
      created_by: req.auth.user_id,
    });

    res.status(201).json({
      status: "success",
      message: req.__("Shipping Rate added successfully"),
      data: new ShippingRateResource(rate).exec(),
    });
  } catch (error) {
    next(error);
  }
};
