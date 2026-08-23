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
