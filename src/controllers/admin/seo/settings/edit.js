import SeoSettings from "../../../../models/SeoSettings.js";

export const edit = async (req, res, next) => {
  try {
    const {
      site_name,
      product_title_template,
      product_description_template,
      title_min_length,
      title_max_length,
      description_min_length,
      description_max_length,
    } = req.body;

    const settings = await SeoSettings.getSingleton();

    Object.assign(settings, {
      ...(site_name !== undefined && { site_name }),
      ...(product_title_template !== undefined && { product_title_template }),
      ...(product_description_template !== undefined && { product_description_template }),
      ...(title_min_length !== undefined && { title_min_length }),
      ...(title_max_length !== undefined && { title_max_length }),
      ...(description_min_length !== undefined && { description_min_length }),
      ...(description_max_length !== undefined && { description_max_length }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    await settings.save();

    res.status(200).json({
      status: "success",
      message: req.__("SEO Settings updated successfully"),
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};
