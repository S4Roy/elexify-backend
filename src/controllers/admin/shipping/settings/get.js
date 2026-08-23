import ShippingSettings from "../../../../models/ShippingSettings.js";

export const get = async (req, res, next) => {
  try {
    const settings = await ShippingSettings.getSingleton();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Settings fetched successfully"),
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
