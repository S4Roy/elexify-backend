import HomePage from "../../../models/HomePage.js";

export const publish = async (req, res, next) => {
  try {
    const homePage = await HomePage.getSingleton();

    // Deep copy so future draft edits never retroactively mutate what's live.
    homePage.published_sections = JSON.parse(JSON.stringify(homePage.sections));
    homePage.status = "published";
    homePage.published_at = new Date();
    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(200).json({
      status: "success",
      message: req.__("Homepage published successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
