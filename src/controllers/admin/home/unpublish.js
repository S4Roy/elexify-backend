import HomePage from "../../../models/HomePage.js";

// Public endpoint reads `status` and returns an empty homepage once it's not
// "published" — this doesn't clear `published_sections` so re-publishing
// later doesn't require redoing the draft-to-published copy.
export const unpublish = async (req, res, next) => {
  try {
    const homePage = await HomePage.getSingleton();
    homePage.status = "draft";
    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(200).json({
      status: "success",
      message: req.__("Homepage unpublished successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
