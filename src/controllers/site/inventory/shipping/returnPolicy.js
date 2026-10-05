import ShippingSettings from "../../../../models/ShippingSettings.js";

/**
 * Store-wide return policy, so cart/checkout only promise returns when the
 * store actually accepts them.
 */
export const returnPolicy = async (req, res, next) => {
  try {
    const settings = await ShippingSettings.getSingleton();
    res.status(200).json({
      status: "success",
      data: {
        enabled: Boolean(settings.returns_enabled),
        window_days: settings.return_window_days,
      },
    });
  } catch (error) {
    next(error);
  }
};
