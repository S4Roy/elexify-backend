import SeoSettings from "../../../../models/SeoSettings.js";

export const get = async (req, res, next) => {
  try {
    const settings = await SeoSettings.getSingleton();

    res.status(200).json({
      status: "success",
      message: req.__("SEO Settings fetched successfully"),
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
