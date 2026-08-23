import HomePage from "../../../models/HomePage.js";

// Page-level fields only (currently just the homepage's own SEO) — section
// content goes through the dedicated section endpoints.
export const update = async (req, res, next) => {
  try {
    const { meta_title, meta_description } = req.body;

    const homePage = await HomePage.getSingleton();
    homePage.seo = {
      meta_title: meta_title ?? homePage.seo?.meta_title ?? null,
      meta_description: meta_description ?? homePage.seo?.meta_description ?? null,
    };
    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(200).json({
      status: "success",
      message: req.__("Homepage updated successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
