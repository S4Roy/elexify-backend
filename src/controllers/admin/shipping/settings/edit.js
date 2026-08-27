import ShippingSettings from "../../../../models/ShippingSettings.js";

export const edit = async (req, res, next) => {
  try {
    const {
      processing_days_min,
      processing_days_max,
      exclude_weekends,
      weekend_days,
      holidays,
      order_cutoff_time,
      default_shipping_zone,
      cod_enabled,
      cod_min_order,
      cod_max_order,
      cod_charge_enabled,
      cod_charge,
      cod_allowed_pincodes,
      cod_disallowed_pincodes,
      cod_disallowed_categories,
      cod_disallowed_brands,
      cod_disallowed_shipping_classes,
      cod_disallowed_zones,
      cod_allowed_customer_types,
    } = req.body;

    const settings = await ShippingSettings.getSingleton();

    Object.assign(settings, {
      ...(processing_days_min !== undefined && { processing_days_min }),
      ...(processing_days_max !== undefined && { processing_days_max }),
      ...(exclude_weekends !== undefined && { exclude_weekends }),
      ...(weekend_days !== undefined && { weekend_days }),
      ...(holidays !== undefined && { holidays }),
      ...(order_cutoff_time !== undefined && { order_cutoff_time }),
      ...(default_shipping_zone !== undefined && {
        default_shipping_zone: default_shipping_zone || null,
      }),
      ...(cod_enabled !== undefined && { cod_enabled }),
      ...(cod_min_order !== undefined && { cod_min_order }),
      ...(cod_max_order !== undefined && { cod_max_order: cod_max_order || null }),
      ...(cod_charge_enabled !== undefined && { cod_charge_enabled }),
      ...(cod_charge !== undefined && { cod_charge }),
      ...(cod_allowed_pincodes !== undefined && { cod_allowed_pincodes }),
      ...(cod_disallowed_pincodes !== undefined && { cod_disallowed_pincodes }),
      ...(cod_disallowed_categories !== undefined && { cod_disallowed_categories }),
      ...(cod_disallowed_brands !== undefined && { cod_disallowed_brands }),
      ...(cod_disallowed_shipping_classes !== undefined && { cod_disallowed_shipping_classes }),
      ...(cod_disallowed_zones !== undefined && { cod_disallowed_zones }),
      ...(cod_allowed_customer_types !== undefined && { cod_allowed_customer_types }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    await settings.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Settings updated successfully"),
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
